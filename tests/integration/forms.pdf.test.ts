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
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-imm-123456789012345678901234567890';
  process.env.JWT_EXPIRES_IN = '1h';
  process.env.DATABASE_URL = 'postgres://imm:test@localhost:5432/imm_test';
  process.env.LOG_LEVEL = 'debug';
  process.env.SEED_DEMO_DATA = 'false';
  return { mem: db, adapter };
});

vi.mock('pg', () => ({
  Pool: adapter.Pool,
  Client: adapter.Client,
}));

vi.mock('node:child_process', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fsModule = require('fs') as typeof import('fs');
  return {
    execFile: (
      _file: string,
      args?: ReadonlyArray<string>,
      options?: any,
      callback?: (error: Error | null, stdout?: string, stderr?: string) => void,
    ) => {
      let cb = callback;
      if (typeof options === 'function') {
        cb = options;
      }

      const outputPath = Array.isArray(args) && args.length >= 4 ? args[3] : undefined;
      if (outputPath) {
        fsModule.writeFileSync(outputPath, 'PDF-CONTENT');
      }

      if (cb) {
        cb(null, '', '');
      }
      return {} as any;
    },
  };
});

import { pool } from '../../src/db/pool';
import { seedDatabase } from '../../src/scripts/seed';
import { createApp } from '../../src/app';

let app: FastifyInstance;

async function loadSchema() {
  const files = [
    path.join(__dirname, '../../artifacts/sql/0001_initial.sql'),
    path.join(__dirname, '../../artifacts/sql/0002_rbac_and_profiles.sql'),
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
    payload: {
      email: 'admin@imm.local',
      password: 'ChangeMe123!',
    },
  });

  expect(response.statusCode).toBe(200);
  return response.json().token as string;
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
  await pool.query('delete from form_submissions');
  await pool.query("update form_templates set status = 'active' where form_type = 'ficha_evolucao'");
  await pool.query(
    "delete from beneficiaries where full_name = 'Beneficiária PDF' or full_name = 'Beneficiária Template Inativo'",
  );
});

describe('Form submissions PDF export', () => {
  it('returns a rendered PDF for an existing submission', async () => {
    const token = await loginAdmin(app);

    const createBeneficiary = await app.inject({
      method: 'POST',
      url: '/beneficiaries',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        fullName: 'Beneficiária PDF',
        householdMembers: [],
        vulnerabilities: [],
      },
    });

    expect(createBeneficiary.statusCode).toBe(201);
    const beneficiaryId = createBeneficiary.json().beneficiary.id as string;

    const createSubmission = await app.inject({
      method: 'POST',
      url: `/beneficiaries/${beneficiaryId}/forms`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        formType: 'ficha_evolucao',
        schemaVersion: 'v1',
        payload: {
          identificacao_atendimento: {
            beneficiaria_nome: 'Beneficiária PDF',
            beneficiaria_id: beneficiaryId,
            data_atendimento: '2024-01-01',
            profissional_responsavel: 'Profissional Teste',
          },
          descricao_atendimento: {
            relato_sessao: 'Relato breve do atendimento.',
          },
        },
      },
    });

    expect(createSubmission.statusCode).toBe(201);
    const submissionId = createSubmission.json().submission.id as string;

    const pdfResponse = await app.inject({
      method: 'GET',
      url: `/forms/${submissionId}/pdf`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(pdfResponse.statusCode).toBe(200);
    expect(pdfResponse.headers['content-type']).toBe('application/pdf');
    expect(pdfResponse.headers['content-disposition']).toMatch(/attachment; filename="form-/);
    expect(pdfResponse.body).toBe('PDF-CONTENT');
  });

  it('returns 404 when submission does not exist', async () => {
    const token = await loginAdmin(app);

    const response = await app.inject({
      method: 'GET',
      url: `/forms/${randomUUID()}/pdf`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(404);
  });

  it('fails when template is inactive', async () => {
    const token = await loginAdmin(app);

    const createBeneficiary = await app.inject({
      method: 'POST',
      url: '/beneficiaries',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        fullName: 'Beneficiária Template Inativo',
        householdMembers: [],
        vulnerabilities: [],
      },
    });

    expect(createBeneficiary.statusCode).toBe(201);
    const beneficiaryId = createBeneficiary.json().beneficiary.id as string;

    const submissionResponse = await app.inject({
      method: 'POST',
      url: `/beneficiaries/${beneficiaryId}/forms`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        formType: 'ficha_evolucao',
        schemaVersion: 'v1',
        payload: {
          identificacao_atendimento: {
            beneficiaria_nome: 'Beneficiária Template Inativo',
            beneficiaria_id: beneficiaryId,
            data_atendimento: '2024-02-01',
            profissional_responsavel: 'Profissional Teste',
          },
          descricao_atendimento: {
            relato_sessao: 'Relato breve do atendimento.',
          },
        },
      },
    });

    expect(submissionResponse.statusCode).toBe(201);
    const submissionId = submissionResponse.json().submission.id as string;

    await pool.query("update form_templates set status = 'inactive' where form_type = $1 and schema_version = $2", [
      'ficha_evolucao',
      'v1',
    ]);

    const pdfResponse = await app.inject({
      method: 'GET',
      url: `/forms/${submissionId}/pdf`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(pdfResponse.statusCode).toBe(400);
  });
});
