import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mem, adapter, tempUploadsDir, fs: fsMod, path: pathMod } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { newDb } = require('pg-mem');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const os = require('os');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require('path');
  const db = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = db.adapters.createPg();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imm-uploads-'));

  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: 'uuid',
    implementation: () => randomUUID(),
  });

  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-imm-123456789012345678901234567890';
  process.env.JWT_EXPIRES_IN = '1h';
  process.env.DATABASE_URL = 'postgres://imm:test@localhost:5432/imm_test';
  process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';
  process.env.UPLOADS_DIR = tempDir;
  process.env.ANTIVIRUS_ALLOW_ON_ERROR = 'false';
  process.env.AUDIT_LOG_SIGNING_KEY = 'test-signing-key-123456789012345678901234';

  return { mem: db, adapter, tempUploadsDir: tempDir, fs, path };
});

const fs = fsMod as typeof import('fs');
const path = pathMod as typeof import('path');

vi.mock('pg', () => ({
  Pool: adapter.Pool,
  Client: adapter.Client,
}));

vi.mock('../../src/modules/attachments/antivirus', () => ({
  scanAttachmentBuffer: vi.fn(),
}));

import { pool } from '../../src/db/pool';
import { uploadAttachment } from '../../src/modules/attachments/service';
import { AppError } from '../../src/shared/errors';
import { scanAttachmentBuffer } from '../../src/modules/attachments/antivirus';

async function loadSchema() {
  const files = [
    path.join(__dirname, '../../artifacts/sql/0001_initial.sql'),
  ];

  for (const sqlPath of files) {
    const schemaSql = fs.readFileSync(sqlPath, 'utf8');
    const statements = schemaSql
      .replace(/--.*$/gm, '')
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean)
      .filter((statement) => {
        const lower = statement.toLowerCase();
        return !lower.startsWith('create extension') && !lower.startsWith('create index');
      });

    for (const statement of statements) {
      mem.public.none(statement);
    }
  }
}

beforeAll(async () => {
  await loadSchema();
});

beforeEach(() => {
  vi.mocked(scanAttachmentBuffer).mockReset();
  process.env.ANTIVIRUS_ALLOW_ON_ERROR = 'false';
});

afterEach(async () => {
  await mem.public.none('delete from attachments');
  await mem.public.none('delete from audit_logs');
  await mem.public.none('delete from audit_log_digests');
});

afterAll(async () => {
  await pool.end();
  try {
    fs.rmSync(tempUploadsDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

describe('uploadAttachment antivirus integration', () => {
  it('persists scan metadata when the antivirus marks the file as clean', async () => {
    const startedAt = new Date('2024-01-01T00:00:00.000Z').toISOString();
    const completedAt = new Date('2024-01-01T00:00:05.000Z').toISOString();
    vi.mocked(scanAttachmentBuffer).mockResolvedValue({
      status: 'clean',
      signature: 'OK',
      engine: 'ClamAV 1.2.3',
      startedAt,
      completedAt,
      error: null,
      rawPayload: { status: 'clean' },
    });

    const attachment = await uploadAttachment({
      ownerType: 'beneficiary',
      ownerId: randomUUID(),
      buffer: Buffer.from('safe'),
      filename: 'safe.txt',
      mimeType: 'text/plain',
      uploadedBy: null,
    });

    expect(attachment.scanStatus).toBe('clean');
    expect(attachment.scanSignature).toBe('OK');
    expect(attachment.scanEngine).toBe('ClamAV 1.2.3');
    expect(attachment.scanCompletedAt).toBe(completedAt);

    const stored = await pool.query(
      'select scan_status, scan_signature, scan_engine, scan_completed_at from attachments where id = $1',
      [attachment.id],
    );
    expect(stored.rows[0].scan_status).toBe('clean');
    expect(stored.rows[0].scan_signature).toBe('OK');
    expect(new Date(stored.rows[0].scan_completed_at).toISOString()).toBe(completedAt);
  });

  it('rejects upload when antivirus flags a threat', async () => {
    vi.mocked(scanAttachmentBuffer).mockResolvedValue({
      status: 'infected',
      signature: 'EICAR-Test-Signature',
      engine: 'ClamAV',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      error: null,
      rawPayload: { status: 'infected' },
    });

    await expect(
      uploadAttachment({
        ownerType: 'beneficiary',
        ownerId: randomUUID(),
        buffer: Buffer.from('malware'),
        filename: 'virus.txt',
        mimeType: 'text/plain',
        uploadedBy: null,
      }),
    ).rejects.toMatchObject({ statusCode: 422 });

    const count = await pool.query('select count(*) from attachments');
    expect(Number(count.rows[0].count)).toBe(0);
  });

  it('blocks upload when scanner fails and fail-safe mode is enabled', async () => {
    vi.mocked(scanAttachmentBuffer).mockResolvedValue({
      status: 'failed',
      signature: null,
      engine: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      error: 'timeout',
      rawPayload: { status: 'failed' },
    });

    await expect(
      uploadAttachment({
        ownerType: 'beneficiary',
        ownerId: randomUUID(),
        buffer: Buffer.from('timeout'),
        filename: 'timeout.txt',
        mimeType: 'text/plain',
        uploadedBy: null,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('persists failed status when scanner fails but uploads are allowed', async () => {
    process.env.ANTIVIRUS_ALLOW_ON_ERROR = 'true';
    vi.mocked(scanAttachmentBuffer).mockResolvedValue({
      status: 'failed',
      signature: null,
      engine: null,
      startedAt: new Date('2024-02-02T10:00:00.000Z').toISOString(),
      completedAt: null,
      error: 'upstream unavailable',
      rawPayload: { status: 'failed' },
    });

    const attachment = await uploadAttachment({
      ownerType: 'beneficiary',
      ownerId: randomUUID(),
      buffer: Buffer.from('retry'),
      filename: 'retry.txt',
      mimeType: 'text/plain',
      uploadedBy: null,
    });

    expect(attachment.scanStatus).toBe('failed');
    expect(attachment.scanError).toBe('upstream unavailable');

    const stored = await pool.query(
      'select scan_status, scan_error from attachments where id = $1',
      [attachment.id],
    );
    expect(stored.rows[0].scan_status).toBe('failed');
    expect(stored.rows[0].scan_error).toBe('upstream unavailable');
  });
});
