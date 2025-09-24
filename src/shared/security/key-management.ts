import { GenerateDataKeyCommand, KMSClient } from '@aws-sdk/client-kms';
import crypto from 'node:crypto';

import { getEnv } from '../../config/env';
import { logger } from '../../config/logger';

let cachedKey: { value: string; expiresAt: number } | null = null;
let kmsClient: KMSClient | null = null;

function getCacheTtlMs(): number {
  const env = getEnv();
  return Number(env.PII_ENCRYPTION_CACHE_TTL_SECONDS) * 1000;
}

function resolveStaticKey(): string | null {
  const env = getEnv();
  if (env.PII_ENCRYPTION_KEY) {
    return env.PII_ENCRYPTION_KEY;
  }

  return null;
}

async function fetchKeyFromKms(): Promise<string | null> {
  const env = getEnv();
  if (!env.PII_ENCRYPTION_KMS_KEY_ID) {
    return null;
  }

  try {
    if (!kmsClient) {
      kmsClient = new KMSClient({});
    }

    const command = new GenerateDataKeyCommand({
      KeyId: env.PII_ENCRYPTION_KMS_KEY_ID,
      KeySpec: 'AES_256',
    });

    const response = await kmsClient.send(command);
    if (!response.Plaintext || !(response.Plaintext instanceof Uint8Array)) {
      return null;
    }

    return Buffer.from(response.Plaintext).toString('base64');
  } catch (error) {
    logger.error({ err: error }, 'failed to load encryption key from KMS');
    return null;
  }
}

export async function getPIIEncryptionKey(): Promise<string | null> {
  const now = Date.now();
  if (cachedKey && cachedKey.expiresAt > now) {
    return cachedKey.value;
  }

  const staticKey = resolveStaticKey();
  if (staticKey) {
    cachedKey = { value: staticKey, expiresAt: now + getCacheTtlMs() };
    return cachedKey.value;
  }

  const kmsKey = await fetchKeyFromKms();
  if (kmsKey) {
    cachedKey = { value: kmsKey, expiresAt: now + getCacheTtlMs() };
    return cachedKey.value;
  }

  return null;
}

export function clearCachedEncryptionKey(): void {
  cachedKey = null;
}

export function deriveAuditSigningKey(): Buffer {
  const env = getEnv();
  const secret = env.AUDIT_LOG_SIGNING_KEY ?? resolveStaticKey();

  if (secret) {
    return Buffer.from(secret, 'utf-8');
  }

  if (!cachedKey) {
    const fallback = crypto.createHash('sha256').update('moveongs-audit-fallback').digest('hex');
    cachedKey = { value: fallback, expiresAt: Date.now() + getCacheTtlMs() };
  }

  return Buffer.from(cachedKey.value, 'utf-8');
}
