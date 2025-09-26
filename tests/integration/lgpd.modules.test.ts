import fs from 'fs';
import os from 'os';
import path from 'path';
import { beforeAll, afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30000, hookTimeout: 60000 });

const { mem, adapter, tempUploadsDir } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { newDb } = require('pg-mem');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fsMod = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const osMod = require('os');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pathMod = require('path');
  const db = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = db.adapters.createPg();
  const tempDir = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'imm-uploads-'));
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { randomUUID } = require('crypto');
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
  process.env.ANTIVIRUS_HOST = 'localhost';
  process.env.ANTIVIRUS_PORT = '8080';
  process.env.ANTIVIRUS_PROTOCOL = 'http';
  process.env.ANTIVIRUS_SCAN_PATH = '/scan';
  process.env.ANTIVIRUS_TIMEOUT_MS = '1000';

  return { mem: db, adapter, tempUploadsDir: tempDir };
});

vi.mock('pg', () => ({
  Pool: adapter.Pool,
  Client: adapter.Client,
}));

import { pool } from '../../src/db/pool';
import { seedDatabase } from '../../src/scripts/seed';
import type { PoolClient } from 'pg';
import {
  registerConsent,
  listConsents,
  updateExistingConsent,
  triggerConsentReviewNotifications,
} from '../../src/modules/consents/service';
import * as notificationService from '../../src/modules/notifications/service';
import { fetchAuditLogs } from '../../src/modules/audit/service';
import {
  uploadAttachment,
  listOwnerAttachments,
  loadAttachmentFile,
  removeAttachment,
} from '../../src/modules/attachments/service';
import { getEnv } from '../../src/config/env';

vi.mock('../../src/modules/attachments/antivirus', () => ({
  scanAttachment: vi.fn(),
}));

import { scanAttachment } from '../../src/modules/attachments/antivirus';

const mockedScanAttachment = vi.mocked(scanAttachment);

let client: PoolClient;

async function createBeneficiary(): Promise<string> {
  const result = await mem.public.one(
    `insert into beneficiaries (full_name) values ('Beneficiária Teste ${Date.now()}') returning id`,
  );
  return result.id as string;
}

async function getAdminUserId(): Promise<string> {
  const result = await mem.public.one('select id from users order by created_at asc limit 1');
  return result.id as string;
}

async function loadSchema() {
  const files = [
    path.join(__dirname, '../../artifacts/sql/0001_initial.sql'),
    path.join(__dirname, '../../artifacts/sql/0002_rbac_and_profiles.sql'),
    path.join(__dirname, '../../artifacts/sql/0006_mfa_consent_reviews_dsr.sql'),
    path.join(__dirname, '../../artifacts/sql/0007_attachment_antivirus.sql'),
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
  await seedDatabase();
  client = await pool.connect();
});

beforeEach(() => {
  mockedScanAttachment.mockResolvedValue({
    status: 'clean',
    signature: null,
    scannedAt: new Date(),
    message: null,
  });
});

afterEach(async () => {
  await mem.public.none('delete from attachments');
  await mem.public.none('delete from consents');
  await mem.public.none('delete from audit_logs');
  await mem.public.none("delete from beneficiaries where full_name like 'Beneficiária Teste %'");
});

afterAll(async () => {
  if (client) {
    client.release();
  }
  await pool.end();
  try {
    fs.rmSync(tempUploadsDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

describe('LGPD modules', () => {
  it('registers, lists and revoga consentimentos com auditoria', async () => {
    const beneficiaryId = await createBeneficiary();
    const userId = await getAdminUserId();

    const grantedAt = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    const consent = await registerConsent({
      beneficiaryId,
      type: 'lgpd',
      textVersion: 'v1',
      granted: true,
      grantedAt,
      evidence: { channel: 'tablet' },
      userId,
    });

    expect(consent).toMatchObject({
      beneficiaryId,
      type: 'lgpd',
      textVersion: 'v1',
      granted: true,
    });

    const schedule = await pool.query(
      'select * from consent_review_schedules where consent_id = $1',
      [consent.id],
    );
    expect(schedule.rowCount).toBe(1);
    expect(schedule.rows[0].is_active).toBe(true);

    const publishSpy = vi.spyOn(notificationService, 'publishNotificationEvent').mockImplementation(() => {});
    const due = await triggerConsentReviewNotifications(new Date());
    publishSpy.mockRestore();

    expect(due).toEqual(expect.arrayContaining([expect.objectContaining({ consentId: consent.id })]));

    const consents = await listConsents({ beneficiaryId });
    expect(consents).toHaveLength(1);

    const revoked = await updateExistingConsent(consent.id, {
      granted: false,
      revokedAt: new Date().toISOString(),
      userId,
    });

    expect(revoked.granted).toBe(false);
    expect(revoked.revokedAt).not.toBeNull();

    const disabledSchedule = await pool.query(
      'select * from consent_review_schedules where consent_id = $1',
      [consent.id],
    );
    expect(disabledSchedule.rows[0]?.is_active).toBe(false);

    const auditEntries = await fetchAuditLogs({ entity: 'consent', entityId: consent.id });

    expect(auditEntries.length).toBeGreaterThanOrEqual(2);
    expect(auditEntries[0].entityId).toBe(consent.id);
  });

  it('persists attachments on filesystem and audit trail', async () => {
    const env = getEnv();
    expect(env.UPLOADS_DIR).toBe(tempUploadsDir);

    const ownerId = await createBeneficiary();
    const userId = await getAdminUserId();

    const buffer = Buffer.from('Arquivo de teste');

    const attachment = await uploadAttachment({
      ownerType: 'beneficiary',
      ownerId,
      buffer,
      filename: 'teste.txt',
      mimeType: 'text/plain',
      uploadedBy: userId,
    });

    expect(attachment).toMatchObject({
      ownerType: 'beneficiary',
      ownerId,
      fileName: 'teste.txt',
      mimeType: 'text/plain',
<<<<<<< HEAD
      scanStatus: 'skipped',
    });
    expect(attachment.scanSignature).toBeNull();
    expect(attachment.scanEngine).toBeNull();
=======
      antivirusScanStatus: 'clean',
      antivirusScanMessage: null,
    });
    expect(attachment.antivirusScannedAt).toEqual(expect.any(String));
>>>>>>> origin/codex/implementar-integracao-com-clamav

    const listed = await listOwnerAttachments({ ownerType: 'beneficiary', ownerId });
    expect(listed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: attachment.id, scanStatus: 'skipped', scanSignature: null }),
      ]),
    );

    const fetched = await loadAttachmentFile(attachment.id);
    expect(fetched.metadata.id).toBe(attachment.id);
    expect(fetched.metadata.scanStatus).toBe('skipped');
    expect(fetched.buffer.toString('utf-8')).toBe('Arquivo de teste');

    const removed = await removeAttachment(attachment.id, userId);
    expect(removed.id).toBe(attachment.id);

    const auditEntries = await fetchAuditLogs({ entity: 'attachment', entityId: attachment.id });
    expect(auditEntries.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects uploads flagged by the antivirus', async () => {
    mockedScanAttachment.mockResolvedValueOnce({
      status: 'infected',
      signature: 'Win.Test.EICAR',
      scannedAt: new Date(),
      message: 'EICAR test file detected',
    });

    await expect(
      uploadAttachment({
        ownerType: 'beneficiary',
        ownerId: await createBeneficiary(),
        buffer: Buffer.from('virus'),
        filename: 'virus.txt',
        mimeType: 'text/plain',
        uploadedBy: await getAdminUserId(),
      }),
    ).rejects.toMatchObject({
      message: 'Uploaded file blocked by antivirus',
      statusCode: 422,
      details: expect.objectContaining({ signature: 'Win.Test.EICAR' }),
    });
  });

  it('persists antivirus failure status when scan cannot complete', async () => {
    mockedScanAttachment.mockResolvedValueOnce({
      status: 'error',
      signature: null,
      scannedAt: new Date(),
      message: 'Scanner timeout',
    });

    const ownerId = await createBeneficiary();
    const userId = await getAdminUserId();

    const attachment = await uploadAttachment({
      ownerType: 'beneficiary',
      ownerId,
      buffer: Buffer.from('Conteúdo qualquer'),
      filename: 'fallback.txt',
      mimeType: 'text/plain',
      uploadedBy: userId,
    });

    expect(attachment.antivirusScanStatus).toBe('error');
    expect(attachment.antivirusScanMessage).toBe('Scanner timeout');
  });
});
