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
  process.env.LOG_LEVEL = 'silent';
  return { mem: db, adapter };
});

vi.mock('pg', () => ({
  Pool: adapter.Pool,
  Client: adapter.Client,
}));

import { pool } from '../../src/db/pool';
import { seedDatabase } from '../../src/scripts/seed';
import { createApp } from '../../src/app';

let app: FastifyInstance;

async function loadSchema() {
  const files = [
    path.join(__dirname, '../../artifacts/sql/0001_initial.sql'),
    path.join(__dirname, '../../artifacts/sql/0002_rbac_and_profiles.sql'),
    path.join(__dirname, '../../artifacts/sql/0006_mfa_consent_reviews_dsr.sql'),
    path.join(__dirname, '../../artifacts/sql/0007_attachment_antivirus.sql'),
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
  await pool.query("delete from beneficiaries where full_name like 'DSR Beneficiary %'");
  await pool.query('delete from dsr_requests');
});

describe('DSR export endpoint', () => {
  it('aggregates beneficiary data for subject rights requests', async () => {
    const beneficiaryId = randomUUID();
    await pool.query(
      `insert into beneficiaries (id, full_name, email, created_at)
       values ($1, $2, $3, now())`,
      [beneficiaryId, 'DSR Beneficiary Example', 'beneficiary@example.com'],
    );

    const vulnerability = await pool.query<{ id: number }>('select id from vulnerabilities limit 1');
    if (vulnerability.rowCount && vulnerability.rows[0]) {
      await pool.query(
        `insert into beneficiary_vulnerabilities (beneficiary_id, vulnerability_id, created_at)
         values ($1, $2, now())`,
        [beneficiaryId, vulnerability.rows[0].id],
      );
    }

    await pool.query(
      `insert into household_members (id, beneficiary_id, name, relationship, created_at)
       values ($1, $2, $3, $4, now())`,
      [randomUUID(), beneficiaryId, 'Household Member', 'Sibling'],
    );

    const consentId = randomUUID();
    await pool.query(
      `insert into consents (id, beneficiary_id, type, text_version, granted, granted_at, revoked_at, evidence)
       values ($1, $2, $3, $4, true, now() - interval '400 days', null, '{"channel":"paper"}'::jsonb)`,
      [consentId, beneficiaryId, 'lgpd', 'v1'],
    );

    await pool.query(
      `insert into form_submissions (id, beneficiary_id, form_type, schema_version, payload, created_at)
       values ($1, $2, $3, $4, $5, now())`,
      [randomUUID(), beneficiaryId, 'test_form', 'v1', { field: 'value' }],
    );

    const projectId = randomUUID();
    await pool.query(
      `insert into projects (id, name, slug, created_at)
       values ($1, $2, $3, now())`,
      [projectId, 'Projeto DSR', `proj-${Date.now()}`],
    );

    const cohortId = randomUUID();
    await pool.query(
      `insert into cohorts (id, project_id, code, created_at)
       values ($1, $2, $3, now())`,
      [cohortId, projectId, 'C1'],
    );

    await pool.query(
      `insert into enrollments (id, beneficiary_id, cohort_id, status, created_at)
       values ($1, $2, $3, 'active', now())`,
      [randomUUID(), beneficiaryId, cohortId],
    );

    const actionPlanId = randomUUID();
    await pool.query(
      `insert into action_plans (id, beneficiary_id, status, created_at)
       values ($1, $2, 'active', now())`,
      [actionPlanId, beneficiaryId],
    );

    await pool.query(
      `insert into action_items (id, action_plan_id, title, status, created_at)
       values ($1, $2, $3, 'pending', now())`,
      [randomUUID(), actionPlanId, 'First action'],
    );

    await pool.query(
      `insert into evolutions (id, beneficiary_id, date, description, created_at)
       values ($1, $2, current_date, $3, now())`,
      [randomUUID(), beneficiaryId, 'Follow-up note'],
    );

    await pool.query(
      `insert into attachments (id, owner_type, owner_id, file_path, file_name, mime_type, size_bytes, created_at)
       values ($1, 'beneficiary', $2, $3, $4, $5, 512, now())`,
      [randomUUID(), beneficiaryId, '/files/doc.pdf', 'doc.pdf', 'application/pdf'],
    );

    await pool.query(
      `insert into audit_logs (user_id, entity, entity_id, action, after_data, created_at)
       values ($1, $2, $3, $4, $5, now())`,
      [null, 'beneficiary', beneficiaryId, 'update', { field: 'value' }],
    );

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'admin@imm.local', password: 'ChangeMe123!' },
    });
    expect(login.statusCode).toBe(200);
    const { token } = login.json() as { token: string };

    const response = await app.inject({
      method: 'GET',
      url: `/dsr/beneficiaries/${beneficiaryId}/export`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const result = response.json() as { data: any; requestId: string };
    expect(result.data.beneficiary).toBeDefined();
    expect(result.data.householdMembers).toHaveLength(1);
    expect(result.data.consents.length).toBeGreaterThanOrEqual(1);
    expect(result.data.actionPlans.length).toBeGreaterThanOrEqual(1);

    const requestRecords = await pool.query(
      'select * from dsr_requests where beneficiary_id = $1',
      [beneficiaryId],
    );
    expect(requestRecords.rowCount).toBe(1);
  });
});
