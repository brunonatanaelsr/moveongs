import { logger } from '../../config/logger';
import { getEnv } from '../../config/env';

type AntivirusStatus = 'clean' | 'infected' | 'error';

export type AntivirusScanResult = {
  status: AntivirusStatus;
  signature: string | null;
  scannedAt: Date;
  message: string | null;
};

function buildEndpoint(): string {
  const env = getEnv();
  const base = `${env.ANTIVIRUS_PROTOCOL}://${env.ANTIVIRUS_HOST}:${env.ANTIVIRUS_PORT}`;
  const url = new URL(env.ANTIVIRUS_SCAN_PATH, base.endsWith('/') ? base : `${base}/`);
  return url.toString();
}

function normaliseStatus(value: unknown): AntivirusStatus {
  if (typeof value !== 'string') {
    return 'error';
  }

  const normalised = value.toLowerCase();
  if (normalised === 'clean' || normalised === 'ok' || normalised === 'passed') {
    return 'clean';
  }

  if (normalised === 'infected' || normalised === 'malicious' || normalised === 'found') {
    return 'infected';
  }

  return 'error';
}

export async function scanAttachment(params: {
  buffer: Buffer;
  fileName?: string | null;
  mimeType?: string | null;
}): Promise<AntivirusScanResult> {
  const env = getEnv();
  const endpoint = buildEndpoint();
  const controller = new AbortController();
  const timeoutMs = Number(env.ANTIVIRUS_TIMEOUT_MS);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      'Content-Type': params.mimeType ?? 'application/octet-stream',
      'X-Filename': params.fileName ?? 'attachment',
    };

    if (env.ANTIVIRUS_API_KEY) {
      headers.Authorization = `Bearer ${env.ANTIVIRUS_API_KEY}`;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      body: params.buffer,
      headers,
      signal: controller.signal,
    });

    const scannedAt = new Date();
    const rawBody = await response.text();
    let payload: any = null;

    if (rawBody.length > 0) {
      try {
        payload = JSON.parse(rawBody);
      } catch {
        payload = rawBody;
      }
    }

    if (!response.ok) {
      logger.warn(
        {
          status: response.status,
          body: payload,
        },
        'antivirus scan request failed',
      );

      return {
        status: 'error',
        signature: null,
        scannedAt,
        message: `Antivirus HTTP ${response.status}`,
      };
    }

    const status = normaliseStatus(payload?.status ?? payload?.result ?? payload?.scanStatus);
    const signature = typeof payload?.signature === 'string' ? payload.signature : null;
    const message = typeof payload?.message === 'string' ? payload.message : null;

    if (status === 'infected') {
      return { status, signature, scannedAt, message };
    }

    if (status === 'clean') {
      return { status, signature, scannedAt, message };
    }

    logger.warn(
      {
        body: payload,
      },
      'antivirus returned unexpected payload',
    );

    return {
      status: 'error',
      signature: null,
      scannedAt,
      message: message ?? 'Unexpected antivirus response',
    };
  } catch (error: any) {
    logger.error({ err: error }, 'antivirus scan threw an error');
    return {
      status: 'error',
      signature: null,
      scannedAt: new Date(),
      message: error?.message ?? 'Unknown antivirus error',
    };
  } finally {
    clearTimeout(timeout);
  }
}
