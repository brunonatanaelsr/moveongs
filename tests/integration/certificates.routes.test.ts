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
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { randomUUID: randomUUIDFn } = require('crypto');
  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: 'uuid',
    implementation: () => randomUUIDFn(),
  });
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pathModule = require('path') as typeof import('path');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-imm-123456789012345678901234567890';
  process.env.JWT_EXPIRES_IN = '1h';
  process.env.DATABASE_URL = 'postgres://imm:test@localhost:5432/imm_test';
  process.env.LOG_LEVEL = 'debug';
  process.env.SEED_DEMO_DATA = 'false';
  process.env.UPLOADS_DIR = pathModule.join(process.cwd(), 'tmp/test-uploads');
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
    path.join(__dirname, '../../artifacts/sql/0004_certificates.sql'),
    path.join(__dirname, '../../artifacts/sql/0006_mfa_consent_reviews_dsr.sql'),
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

async function loginAdmin(appInstance: FastifyInstance): Promise<string> {
  const response = await appInstance.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: 'admin@imm.local', password: 'ChangeMe123!' },
  });

  expect(response.statusCode).toBe(200);
  return response.json().token as string;
}

async function createEnrollmentWithAttendance(params: {
  projectName: string;
  cohortCode: string;
  beneficiaryName: string;
  totalSessions: number;
  presentSessions: number;
}) {
  const beneficiaryId = randomUUID();
  const projectId = randomUUID();
  const cohortId = randomUUID();
  const enrollmentId = randomUUID();

  await pool.query(
    `insert into beneficiaries (id, full_name) values ($1, $2)`,
    [beneficiaryId, params.beneficiaryName],
  );

  await pool.query(
    `insert into projects (id, name) values ($1, $2)`,
    [projectId, params.projectName],
  );

  await pool.query(
    `insert into cohorts (id, project_id, code) values ($1, $2, $3)`,
    [cohortId, projectId, params.cohortCode],
  );

  await pool.query(
    `insert into enrollments (id, beneficiary_id, cohort_id, status, enrolled_at)
       values ($1, $2, $3, 'active', current_date)`,
    [enrollmentId, beneficiaryId, cohortId],
  );

  for (let i = 0; i < params.totalSessions; i += 1) {
    const present = i < params.presentSessions;
    await pool.query(
      `insert into attendance (id, enrollment_id, date, present, justification)
         values ($1, $2, $3::date, $4, $5)`,
      [
        randomUUID(),
        enrollmentId,
        `2024-07-${String(i + 1).padStart(2, '0')}`,
        present,
        present ? null : 'Ausência registrada em teste',
      ],
    );
  }

  return { enrollmentId };
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
  await pool.query('delete from certificates');
});

describe('Certificates routes', () => {
  it('issues, lists and downloads certificates for eligible enrollments', async () => {
    const token = await loginAdmin(app);
    const { enrollmentId } = await createEnrollmentWithAttendance({
      projectName: 'Projeto de Certificação',
      cohortCode: 'TURMA-1',
      beneficiaryName: 'Ana de Teste',
      totalSessions: 4,
      presentSessions: 3,
    });

    const issueResponse = await app.inject({
      method: 'POST',
      url: `/enrollments/${enrollmentId}/certificates`,
      headers: { authorization: `Bearer ${token}` },
      payload: { metadata: { ceremony: 'Encerramento 2024' } },
    });

    expect(issueResponse.statusCode).toBe(201);
    const issuedCertificate = issueResponse.json().certificate as { id: string };
    expect(issuedCertificate).toMatchObject({ enrollmentId });

    const listResponse = await app.inject({
      method: 'GET',
      url: `/enrollments/${enrollmentId}/certificates`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(listResponse.statusCode).toBe(200);
    const listData = listResponse.json();
    expect(listData.data).toHaveLength(1);
    expect(listData.data[0]).toMatchObject({ id: issuedCertificate.id, enrollmentId });

    const downloadResponse = await app.inject({
      method: 'GET',
      url: `/certificates/${issuedCertificate.id}/download`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(downloadResponse.statusCode).toBe(200);
    expect(downloadResponse.headers['content-type']).toBe('application/pdf');
    expect(downloadResponse.headers['content-disposition']).toContain('attachment;');
    expect(downloadResponse.rawPayload?.length ?? 0).toBeGreaterThan(0);
  });

  it('blocks issuance when attendance is below the minimum', async () => {
    const token = await loginAdmin(app);
    const { enrollmentId } = await createEnrollmentWithAttendance({
      projectName: 'Projeto Frequência Baixa',
      cohortCode: 'TURMA-2',
      beneficiaryName: 'Beatriz Teste',
      totalSessions: 4,
      presentSessions: 1,
    });

    const issueResponse = await app.inject({
      method: 'POST',
      url: `/enrollments/${enrollmentId}/certificates`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(issueResponse.statusCode).toBe(422);
  });
});
