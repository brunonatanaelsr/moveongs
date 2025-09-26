import { createConnection } from 'net';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import { getEnv } from '../../config/env';
import { logger } from '../../observability/logger';

interface ScanResult {
  isInfected: boolean;
  viruses: string[];
}

export class AntivirusScanner {
  private static readonly EICAR_TEST_STRING =
    'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

  private static readonly CHUNK_SIZE = 1024;
  private static readonly END_RESPONSE = 'stream: OK';
  private static readonly FOUND_RESPONSE = 'stream: ';
  private static readonly PORT_RESPONSE = 'PORT';
  private static readonly RESPONSE_OK = 'OK';
  private static readonly STREAM_RESPONSE = 'INSTREAM';

  private readonly host: string;
  private readonly port: number;
  private readonly timeoutMs: number;

  constructor() {
    const env = getEnv();
    this.host = env.ANTIVIRUS_HOST;
    this.port = parseInt(env.ANTIVIRUS_PORT, 10);
    this.timeoutMs = parseInt(env.ANTIVIRUS_TIMEOUT_MS, 10);
  }

  async scanFile(filePath: string): Promise<ScanResult> {
    const env = getEnv();
    if (env.ANTIVIRUS_ENABLED !== 'true') {
      logger.debug('Antivirus scanning is disabled');
      return { isInfected: false, viruses: [] };
    }

    try {
      const fileBuffer = await readFile(filePath);
      return this.scanBuffer(fileBuffer);
    } catch (error) {
      logger.error({ error }, 'Failed to scan file for viruses');
      throw new Error('Failed to scan file for viruses');
    }
  }

  async scanBuffer(buffer: Buffer): Promise<ScanResult> {
    const env = getEnv();
    if (env.ANTIVIRUS_ENABLED !== 'true') {
      logger.debug('Antivirus scanning is disabled');
      return { isInfected: false, viruses: [] };
    }

    return new Promise((resolve, reject) => {
      const socket = createConnection(this.port, this.host);
      const timeoutId = setTimeout(() => {
        socket.destroy();
        reject(new Error('Antivirus scan timed out'));
      }, this.timeoutMs);

      let response = '';

      socket.on('data', (data) => {
        response += data.toString();

        if (response.includes(this.constructor.END_RESPONSE)) {
          clearTimeout(timeoutId);
          socket.end();

          const viruses = this.parseResponse(response);
          resolve({
            isInfected: viruses.length > 0,
            viruses,
          });
        }
      });

      socket.on('error', (error) => {
        clearTimeout(timeoutId);
        logger.error({ error }, 'Antivirus scan failed');
        reject(new Error('Antivirus scan failed'));
      });

      this.writeToSocket(socket, buffer).catch((error) => {
        clearTimeout(timeoutId);
        logger.error({ error }, 'Failed to write to antivirus socket');
        reject(new Error('Failed to write to antivirus socket'));
      });
    });
  }

  private async writeToSocket(socket: any, buffer: Buffer): Promise<void> {
    const write = promisify(socket.write).bind(socket);

    for (let i = 0; i < buffer.length; i += this.constructor.CHUNK_SIZE) {
      const chunk = buffer.slice(i, i + this.constructor.CHUNK_SIZE);
      const size = Buffer.alloc(4);
      size.writeUInt32BE(chunk.length);
      await write(size);
      await write(chunk);
    }

    const end = Buffer.alloc(4);
    end.writeUInt32BE(0);
    await write(end);
  }

  private parseResponse(response: string): string[] {
    const viruses: string[] = [];
    const lines = response.split('\n');

    for (const line of lines) {
      if (line.startsWith(this.constructor.FOUND_RESPONSE)) {
        const virus = line.substring(this.constructor.FOUND_RESPONSE.length).trim();
        if (virus !== this.constructor.RESPONSE_OK) {
          viruses.push(virus);
        }
      }
    }

    return viruses;
  }

  async testConnection(): Promise<boolean> {
    const env = getEnv();
    if (env.ANTIVIRUS_ENABLED !== 'true') {
      logger.debug('Antivirus scanning is disabled');
      return true;
    }

    try {
      const testBuffer = Buffer.from(this.constructor.EICAR_TEST_STRING);
      const result = await this.scanBuffer(testBuffer);
      return result.isInfected;
    } catch (error) {
      logger.error({ error }, 'Antivirus connection test failed');
      return false;
    }
  }
}

export const antivirusScanner = new AntivirusScanner();
