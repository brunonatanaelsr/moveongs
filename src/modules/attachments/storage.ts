import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

import { getEnv } from '../../config/env';
import { logger } from '../../config/logger';

type StorageMode = 'filesystem' | 's3';

let uploadsDir: string | null = null;
let s3Client: S3Client | null = null;

function getStorageMode(): StorageMode {
  const env = getEnv();
  return env.ATTACHMENTS_STORAGE ?? 'filesystem';
}

async function ensureDirExists(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function getS3Client(): Promise<S3Client> {
  if (s3Client) {
    return s3Client;
  }

  const env = getEnv();
  if (!env.S3_BUCKET) {
    throw new Error('S3 bucket not configured for attachment storage');
  }

  s3Client = new S3Client({
    region: env.S3_REGION ?? 'us-east-1',
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
    credentials:
      env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? {
            accessKeyId: env.S3_ACCESS_KEY_ID,
            secretAccessKey: env.S3_SECRET_ACCESS_KEY,
          }
        : undefined,
  });

  return s3Client;
}

export async function getUploadsDir(): Promise<string> {
  if (!uploadsDir) {
    const env = getEnv();
    const base = env.UPLOADS_DIR ?? 'tmp/uploads';
    uploadsDir = path.isAbsolute(base) ? base : path.resolve(process.cwd(), base);
    await ensureDirExists(uploadsDir);
  }

  return uploadsDir;
}

function buildS3Key(originalName?: string | null): string {
  const ext = originalName ? path.extname(originalName) : '';
  return `${randomUUID()}${ext}`;
}

function resolveServerSideEncryption(value?: string | null): 'AES256' | 'aws:kms' | undefined {
  if (!value) {
    return undefined;
  }

  if (value === 'AES256' || value === 'aws:kms') {
    return value;
  }

  logger.warn({ algorithm: value }, 'unsupported S3 server-side encryption value');
  return undefined;
}

async function collectBodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) {
    return Buffer.alloc(0);
  }

  if (Buffer.isBuffer(body)) {
    return body;
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  if (typeof body === 'string') {
    return Buffer.from(body);
  }

  if (typeof (body as any).arrayBuffer === 'function') {
    const arrayBuffer = await (body as any).arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  if (typeof (body as any).transformToByteArray === 'function') {
    const byteArray = await (body as any).transformToByteArray();
    return Buffer.from(byteArray);
  }

  if (typeof (body as any)[Symbol.asyncIterator] === 'function') {
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Buffer | Uint8Array | string>) {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      } else if (chunk instanceof Uint8Array) {
        chunks.push(Buffer.from(chunk));
      } else {
        chunks.push(Buffer.from(chunk));
      }
    }
    return Buffer.concat(chunks);
  }

  throw new Error('Unsupported body type received from object storage');
}

export async function saveFile(
  buffer: Buffer,
  originalName?: string | null,
  mimeType?: string | null,
): Promise<{ filePath: string; fileName: string }> {
  const mode = getStorageMode();

  if (mode === 's3') {
    const env = getEnv();
    const client = await getS3Client();
    const key = buildS3Key(originalName);

    const command = new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType ?? undefined,
      ServerSideEncryption: resolveServerSideEncryption(env.S3_SERVER_SIDE_ENCRYPTION),
    });

    await client.send(command);

    return { filePath: `s3://${env.S3_BUCKET}/${key}`, fileName: originalName ?? key };
  }

  const dir = await getUploadsDir();
  const ext = originalName ? path.extname(originalName) : '';
  const fileName = `${randomUUID()}${ext}`;
  const filePath = path.join(dir, fileName);
  await fs.writeFile(filePath, buffer);
  return { filePath, fileName };
}

function isS3Path(filePath: string): boolean {
  return filePath.startsWith('s3://');
}

function parseS3Path(filePath: string): { bucket: string; key: string } {
  const withoutPrefix = filePath.replace('s3://', '');
  const [bucket, ...rest] = withoutPrefix.split('/');
  return { bucket, key: rest.join('/') };
}

export async function deleteFile(filePath: string): Promise<void> {
  const mode = getStorageMode();

  if (mode === 's3' || isS3Path(filePath)) {
    try {
      const env = getEnv();
      const client = await getS3Client();
      const { bucket, key } = isS3Path(filePath)
        ? parseS3Path(filePath)
        : { bucket: env.S3_BUCKET!, key: filePath };

      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );
    } catch (error) {
      logger.warn({ err: error }, 'failed to delete attachment from object storage');
    }
    return;
  }

  try {
    await fs.unlink(filePath);
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

export async function readFile(filePath: string): Promise<Buffer> {
  const mode = getStorageMode();

  if (mode === 's3' || isS3Path(filePath)) {
    const env = getEnv();
    const client = await getS3Client();
    const { bucket, key } = isS3Path(filePath)
      ? parseS3Path(filePath)
      : { bucket: env.S3_BUCKET!, key: filePath };

    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    if (!response.Body) {
      throw new Error('Empty object body received from storage');
    }

    return collectBodyToBuffer(response.Body as any);
  }

  return fs.readFile(filePath);
}
