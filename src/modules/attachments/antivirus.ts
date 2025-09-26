import { getEnv } from '../../config/env';
import { logger } from '../../config/logger';

export type AntivirusScanStatus = 'clean' | 'infected' | 'pending' | 'failed' | 'skipped';

export type AntivirusScanResult = {
  status: AntivirusScanStatus;
  signature: string | null;
  engine: string | null;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  rawPayload?: unknown;
};

type ScanParams = {
  buffer: Buffer;
  fileName?: string | null;
  mimeType?: string | null;
  checksum: string;
  sizeBytes: number;
};

function buildBaseUrl(): URL | null {
  const env = getEnv();
  if (!env.ANTIVIRUS_HOST) {
    return null;
  }

  const protocol = env.ANTIVIRUS_TLS === 'true' ? 'https' : 'http';
  const port = env.ANTIVIRUS_PORT ? `:${env.ANTIVIRUS_PORT}` : '';
  const path = env.ANTIVIRUS_PATH.startsWith('/') ? env.ANTIVIRUS_PATH : `/${env.ANTIVIRUS_PATH}`;
  return new URL(`${protocol}://${env.ANTIVIRUS_HOST}${port}${path}`);
}

function normalizeStatus(status: unknown): AntivirusScanStatus {
  if (typeof status !== 'string') {
    return 'failed';
  }

  switch (status.toLowerCase()) {
    case 'clean':
    case 'ok':
    case 'passed':
    case 'safe':
      return 'clean';
    case 'infected':
    case 'malicious':
    case 'threat':
    case 'virus':
      return 'infected';
    case 'pending':
    case 'queued':
    case 'processing':
      return 'pending';
    case 'failed':
    case 'error':
    case 'timeout':
      return 'failed';
    case 'skipped':
    case 'disabled':
      return 'skipped';
    default:
      return 'failed';
  }
}

function parseDate(value: unknown): string | null {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return null;
}

function extractSignature(payload: any): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const possibleKeys = ['signature', 'virus', 'malware', 'threat'];
  for (const key of possibleKeys) {
    if (typeof payload[key] === 'string' && payload[key].trim().length > 0) {
      return payload[key];
    }
  }

  return null;
}

function extractEngine(payload: any): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const possibleKeys = ['engine', 'engineVersion', 'version', 'clamavVersion'];
  for (const key of possibleKeys) {
    if (typeof payload[key] === 'string' && payload[key].trim().length > 0) {
      return payload[key];
    }
  }

  return null;
}

function extractError(payload: any): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const possibleKeys = ['error', 'message', 'detail'];
  for (const key of possibleKeys) {
    if (typeof payload[key] === 'string' && payload[key].trim().length > 0) {
      return payload[key];
    }
  }

  return null;
}

function buildDefaultResult(status: AntivirusScanStatus, payload: unknown): AntivirusScanResult {
  return {
    status,
    signature: null,
    engine: null,
    startedAt: null,
    completedAt: null,
    error: status === 'failed' ? 'Antivirus scan failed' : null,
    rawPayload: payload,
  };
}

export async function scanAttachmentBuffer(params: ScanParams): Promise<AntivirusScanResult> {
  const baseUrl = buildBaseUrl();
  if (!baseUrl) {
    return {
      status: 'skipped',
      signature: null,
      engine: null,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      error: null,
    };
  }

  const env = getEnv();
  const controller = new AbortController();
  const timeout = Number(env.ANTIVIRUS_TIMEOUT_MS ?? '10000');
  const timeoutHandle = setTimeout(() => controller.abort(), timeout);

  try {
    const payload = {
      fileName: params.fileName ?? null,
      mimeType: params.mimeType ?? null,
      checksum: params.checksum,
      sizeBytes: params.sizeBytes,
      content: params.buffer.toString('base64'),
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (env.ANTIVIRUS_API_KEY) {
      headers['x-api-key'] = env.ANTIVIRUS_API_KEY;
    }

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const responseText = await response.text();
    let jsonPayload: unknown = null;
    try {
      jsonPayload = responseText.length > 0 ? JSON.parse(responseText) : null;
    } catch (parseError) {
      logger.warn({ err: parseError, response: responseText }, 'failed to parse antivirus response');
    }

    if (!response.ok) {
      logger.error({ status: response.status, body: jsonPayload ?? responseText }, 'antivirus scan request failed');
      return buildDefaultResult('failed', jsonPayload ?? responseText);
    }

    const normalizedStatus = jsonPayload && typeof jsonPayload === 'object' ? normalizeStatus((jsonPayload as any).status) : 'failed';
    const signature = extractSignature(jsonPayload);
    const engine = extractEngine(jsonPayload);
    const startedAt = parseDate(jsonPayload && typeof jsonPayload === 'object' ? (jsonPayload as any).startedAt : null);
    const completedAt =
      parseDate(jsonPayload && typeof jsonPayload === 'object' ? (jsonPayload as any).completedAt : null) ??
      parseDate(jsonPayload && typeof jsonPayload === 'object' ? (jsonPayload as any).scannedAt : null);
    const error = extractError(jsonPayload);

    const baseResult: AntivirusScanResult = {
      status: normalizedStatus,
      signature,
      engine,
      startedAt,
      completedAt: completedAt ?? (normalizedStatus === 'clean' || normalizedStatus === 'failed' ? new Date().toISOString() : null),
      error: normalizedStatus === 'failed' ? error ?? 'Antivirus scan failed' : normalizedStatus === 'infected' ? error : null,
      rawPayload: jsonPayload,
    };

    if (normalizedStatus === 'failed' && !baseResult.error) {
      baseResult.error = 'Antivirus scan failed';
    }

    return baseResult;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      logger.error({ timeout }, 'antivirus scan request timed out');
      return buildDefaultResult('failed', { error: 'Scan timed out' });
    }

    logger.error({ err: error }, 'antivirus scan request threw an error');
    return buildDefaultResult('failed', { error: error instanceof Error ? error.message : 'Unknown error' });
  } finally {
    clearTimeout(timeoutHandle);
  }
}
