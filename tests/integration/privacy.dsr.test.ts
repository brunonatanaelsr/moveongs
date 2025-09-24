import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.setConfig({ testTimeout: 20000, hookTimeout: 30000 });

const { mem, adapter } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { newDb } = require('pg-mem');
  const db = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = db.adapters.createPg();
  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: 'uuid',
    implementation: () => randomUUID(),
  });
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-imm-123456789012345678901234567890';
  process.env.JWT_EXPIRES_IN = '1h';
  process.env.DATABASE_URL = 'postgres://imm:test@localhost:5432/imm_test';
  process.env.LOG_LEVEL = 'debug';
  return { mem: db, adapter };
});

vi.mock('pg', () => ({
  Pool: adapter.Pool,
  Client: adapter.Client,
}));

import { pool } from '../../src/db/pool';
import { seedDatabase } from '../../src/scripts/seed';
import { createApp } from '../../src/app';
import { runDataSubjectRequestSlaScan } from '../../src/modules/privacy/service';

let app: FastifyInstance;

async function loadSchema() {
  const files = [
    path.join(__dirname, '../../artifacts/sql/0001_initial.sql'),
    path.join(__dirname, '../../artifacts/sql/0002_rbac_and_profiles.sql'),
    path.join(__dirname, '../../artifacts/sql/0006_compliance_and_mfa.sql'),
  ];

  for (const sqlPath of files) {
    const schemaSql = fs.readFileSync(sqlPath, 'utf8');
    const sanitized = schemaSql
      .replace(/--.*$/gm, '')
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean)
      .filter((statement) => {
        const lower = statement.toLowerCase();
        return !lower.startsWith('create extension') && !lower.startsWith('create index');
      });

    for (const statement of sanitized) {
      mem.public.none(statement);
    }
  }
}

beforeAll(async () => {
  await loadSchema();
  await seedDatabase();
  app = await createApp();
  await app.ready();
});

afterAll(async () => {
  if (app) {
    await app.close();
  }
  await pool.end();
});

beforeEach(async () => {
  await pool.query('delete from data_subject_request_exports');
  await pool.query('delete from data_subject_requests');
  await pool.query('delete from consent_review_queue');
});

describe('Data subject requests', () => {
  async function loginAdmin() {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'admin@imm.local', password: 'ChangeMe123!' },
    });
    expect(response.statusCode).toBe(200);
    return response.json().token as string;
  }

  async function createBeneficiary() {
    const beneficiaryId = randomUUID();
    await pool.query(
      `insert into beneficiaries (id, full_name, created_at, updated_at)
       values ($1, $2, now(), now())`,
      [beneficiaryId, 'Beneficiária DSR'],
    );
    await pool.query(
      `insert into consents (id, beneficiary_id, type, text_version, granted, granted_at, created_by)
       values ($1, $2, 'lgpd', 'v1', true, now() - interval '400 days', null)`,
      [randomUUID(), beneficiaryId],
    );
    return beneficiaryId;
  }

  it('generates export payload and audit trail', async () => {
    const token = await loginAdmin();
    const beneficiaryId = await createBeneficiary();

    const response = await app.inject({
      method: 'POST',
      url: '/privacy/dsr',
      headers: { authorization: `Bearer ${token}` },
      payload: { beneficiaryId },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.request.status).toBe('completed');
    expect(body.export.payload).toHaveProperty('beneficiary');
    expect(body.export.payload.beneficiary.id).toBe(beneficiaryId);

    const fetch = await app.inject({
      method: 'GET',
      url: `/privacy/dsr/${body.request.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(fetch.statusCode).toBe(200);
    expect(fetch.json().request.id).toBe(body.request.id);

    const exportFetch = await app.inject({
      method: 'GET',
      url: `/privacy/dsr/${body.request.id}/export`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(exportFetch.statusCode).toBe(200);
    expect(exportFetch.json().export.payload.beneficiary.id).toBe(beneficiaryId);
  });

  it('flags overdue requests in SLA scan', async () => {
    const beneficiaryId = await createBeneficiary();
    const requestId = randomUUID();
    await pool.query(
      `insert into data_subject_requests (id, beneficiary_id, request_type, status, due_at, requested_at)
       values ($1, $2, 'export', 'pending', now() - interval '5 days', now() - interval '10 days')`,
      [requestId, beneficiaryId],
    );

    const result = await runDataSubjectRequestSlaScan(new Date());
    expect(result.breached).toContain(requestId);

    const updated = await pool.query<{ sla_breached: boolean }>(
      'select sla_breached from data_subject_requests where id = $1',
      [requestId],
    );
    expect(updated.rows[0]?.sla_breached).toBe(true);
  });
});
