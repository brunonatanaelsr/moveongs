import fs from 'fs';
import path from 'path';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
vi.setConfig({ testTimeout: 20000, hookTimeout: 30000 });
import type { FastifyInstance } from 'fastify';

const { mem, adapter } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { newDb } = require('pg-mem');
  const db = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = db.adapters.createPg();
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
  process.env.LOG_LEVEL = 'silent';
  return { mem: db, adapter };
});

vi.mock('pg', () => ({
  Pool: adapter.Pool,
  Client: adapter.Client,
}));

import { seedDatabase } from '../../src/scripts/seed';
import { pool } from '../../src/db/pool';
import { createApp } from '../../src/app';

let app: FastifyInstance;
let seededBeneficiaryId: string | null = null;

async function loadSchema() {
  const files = [
    path.join(__dirname, '../../artifacts/sql/0001_initial.sql'),
    path.join(__dirname, '../../artifacts/sql/0002_rbac_and_profiles.sql'),
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

  const permissionsCount = await pool.query('select count(*)::int as count from permissions');
  const rolePermissionsCount = await pool.query('select count(*)::int as count from role_permissions');

  if ((permissionsCount.rows[0]?.count ?? 0) === 0 || (rolePermissionsCount.rows[0]?.count ?? 0) === 0) {
    throw new Error('RBAC seed did not populate permissions tables');
  }

  app = await createApp();
  await app.ready();
});

afterAll(async () => {
  if (app) {
    await app.close();
  }
  await pool.end();
});

describe('IMM API basics', () => {
  it('authenticates seeded admin user', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'admin@imm.local',
        password: 'ChangeMe123!',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty('token');
    expect(body.user).toMatchObject({ email: 'admin@imm.local' });
    expect(body.user.permissions).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'beneficiaries:read' }),
      expect.objectContaining({ key: 'form_submissions:create' })
    ]));
  });

  it('creates a beneficiary when authorized', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'admin@imm.local',
        password: 'ChangeMe123!',
      },
    });

    const { token, user: loggedUser } = login.json();
    expect(loggedUser.permissions).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'beneficiaries:create' }),
      expect.objectContaining({ key: 'beneficiaries:update' })
    ]));

    const uniqueCode = `IMM-${Date.now()}`;

    const createResponse = await app.inject({
      method: 'POST',
      url: '/beneficiaries',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        code: uniqueCode,
        fullName: 'Beneficiária Teste',
        birthDate: '1990-01-01',
        cpf: '12345678900',
        phone1: '21999999999',
        address: 'Rua de Teste, 123',
        neighborhood: 'Centro',
        city: 'Rio de Janeiro',
        state: 'RJ',
        householdMembers: [
          {
            name: 'Familiar Teste',
            birthDate: '2010-05-10',
            works: false,
            income: 0,
            relationship: 'Filho(a)',
          },
        ],
        vulnerabilities: ['desemprego'],
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const { beneficiary } = createResponse.json();
    expect(beneficiary).toMatchObject({
      code: uniqueCode,
      fullName: 'Beneficiária Teste',
      vulnerabilities: [{ slug: 'desemprego', label: expect.any(String) }],
    });

    seededBeneficiaryId = beneficiary.id;
  });

  it('manages form templates and submissions', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'admin@imm.local',
        password: 'ChangeMe123!',
      },
    });

    const { token } = login.json();

    const templateResponse = await app.inject({
      method: 'POST',
      url: '/form-templates',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        formType: 'anamnese_social',
        schemaVersion: 'v1',
        schema: {
          title: 'Anamnese Social',
          type: 'object',
          properties: {
            nome: { type: 'string' },
          },
        },
      },
    });

    expect(templateResponse.statusCode).toBe(201);
    const { template } = templateResponse.json();
    expect(template).toMatchObject({
      formType: 'anamnese_social',
      schemaVersion: 'v1',
      status: 'active',
    });

    const templateResponseV2 = await app.inject({
      method: 'POST',
      url: '/form-templates',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        formType: 'anamnese_social',
        schemaVersion: 'v2',
        schema: {
          title: 'Anamnese Social v2',
          type: 'object',
        },
      },
    });

    expect(templateResponseV2.statusCode).toBe(201);

    const listTemplates = await app.inject({
      method: 'GET',
      url: '/form-templates',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(listTemplates.statusCode).toBe(200);
    expect(listTemplates.json().data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ schemaVersion: 'v1' }),
        expect.objectContaining({ schemaVersion: 'v2' }),
      ]),
    );

    let beneficiaryId = seededBeneficiaryId;

    if (!beneficiaryId) {
      const fallback = await app.inject({
        method: 'POST',
        url: '/beneficiaries',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {
          fullName: 'Beneficiária Form Teste',
          householdMembers: [],
          vulnerabilities: [],
        },
      });

      expect(fallback.statusCode).toBe(201);
      beneficiaryId = fallback.json().beneficiary.id as string;
      seededBeneficiaryId = beneficiaryId;
    }

    expect(beneficiaryId).toBeTruthy();

    const submissionResponse = await app.inject({
      method: 'POST',
      url: `/beneficiaries/${beneficiaryId}/forms`,
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        formType: 'anamnese_social',
        payload: {
          identificacao: {
            nome: 'Beneficiária Form Teste',
            cpf: '12345678900',
          },
        },
        signedBy: ['Admin IMM'],
        signedAt: [new Date().toISOString()],
        attachments: [{ fileName: 'assinatura.png' }],
      },
    });

    expect(submissionResponse.statusCode).toBe(201);
    const { submission } = submissionResponse.json();
    expect(submission).toMatchObject({
      beneficiaryId,
      formType: 'anamnese_social',
      schemaVersion: 'v2',
      signedBy: ['Admin IMM'],
    });

    const listSubmissions = await app.inject({
      method: 'GET',
      url: `/beneficiaries/${beneficiaryId}/forms`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(listSubmissions.statusCode).toBe(200);
    expect(listSubmissions.json().data[0]).toMatchObject({
      id: submission.id,
      schemaVersion: 'v2',
    });

    const getSubmission = await app.inject({
      method: 'GET',
      url: `/forms/${submission.id}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(getSubmission.statusCode).toBe(200);
    expect(getSubmission.json().submission.template).toMatchObject({
      schemaVersion: 'v2',
    });

    const updateSubmission = await app.inject({
      method: 'PATCH',
      url: `/forms/${submission.id}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        signedBy: [],
        signedAt: [],
        attachments: null,
      },
    });

    expect(updateSubmission.statusCode).toBe(200);
    expect(updateSubmission.json().submission).toMatchObject({
      signedBy: [],
      attachments: [],
    });

    const duplicateTemplate = await app.inject({
      method: 'POST',
      url: '/form-templates',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        formType: 'anamnese_social',
        schemaVersion: 'v2',
        schema: { title: 'Duplicated' },
      },
    });

    expect(duplicateTemplate.statusCode).toBe(409);
  });

  it('manages consents, attachments and audit logs', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'admin@imm.local',
        password: 'ChangeMe123!',
      },
    });

    expect(login.statusCode).toBe(200);
    const { token } = login.json();

    let beneficiaryId = seededBeneficiaryId;

    if (!beneficiaryId) {
      const createBeneficiaryResponse = await app.inject({
        method: 'POST',
        url: '/beneficiaries',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          fullName: 'Beneficiária Consent Teste',
          householdMembers: [],
          vulnerabilities: [],
        },
      });

      expect(createBeneficiaryResponse.statusCode).toBe(201);
      beneficiaryId = createBeneficiaryResponse.json().beneficiary.id as string;
      seededBeneficiaryId = beneficiaryId;
    }

    const consentResponse = await app.inject({
      method: 'POST',
      url: `/beneficiaries/${beneficiaryId}/consents`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        type: 'lgpd',
        textVersion: 'v1',
        granted: true,
        evidence: { method: 'digital-signature' },
      },
    });

    expect(consentResponse.statusCode).toBe(201);
    const { consent } = consentResponse.json();
    expect(consent).toMatchObject({
      beneficiaryId,
      type: 'lgpd',
      textVersion: 'v1',
      granted: true,
    });

    const listConsents = await app.inject({
      method: 'GET',
      url: `/beneficiaries/${beneficiaryId}/consents`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(listConsents.statusCode).toBe(200);
    expect(listConsents.json().data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: consent.id })]),
    );

    const revokeResponse = await app.inject({
      method: 'PATCH',
      url: `/consents/${consent.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        granted: false,
        revokedAt: new Date().toISOString(),
      },
    });

    expect(revokeResponse.statusCode).toBe(200);
    expect(revokeResponse.json().consent.revokedAt).not.toBeNull();

    const boundary = '----IMMTestBoundary';
    const fileContent = 'Arquivo de teste IMM';
    const multipartBody = Buffer.from(
      `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="ownerType"\r\n\r\nbeneficiary\r\n' +
      `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="ownerId"\r\n\r\n' + beneficiaryId + '\r\n' +
      `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="file"; filename="teste.txt"\r\n' +
      'Content-Type: text/plain\r\n\r\n' +
      fileContent + '\r\n' +
      `--${boundary}--\r\n`,
      'utf-8',
    );

    const uploadResponse = await app.inject({
      method: 'POST',
      url: '/files',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: multipartBody,
    });

    expect(uploadResponse.statusCode).toBe(201);
    const { attachment } = uploadResponse.json();
    expect(attachment).toMatchObject({ ownerType: 'beneficiary', ownerId: beneficiaryId });

    const listAttachmentsResponse = await app.inject({
      method: 'GET',
      url: `/attachments?ownerType=beneficiary&ownerId=${beneficiaryId}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(listAttachmentsResponse.statusCode).toBe(200);
    expect(listAttachmentsResponse.json().data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: attachment.id })]),
    );

    const metadataResponse = await app.inject({
      method: 'GET',
      url: `/attachments/${attachment.id}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(metadataResponse.statusCode).toBe(200);

    const downloadResponse = await app.inject({
      method: 'GET',
      url: `/attachments/${attachment.id}?download=1`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(downloadResponse.statusCode).toBe(200);
    expect(downloadResponse.body).toBe(fileContent);

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/attachments/${attachment.id}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(deleteResponse.statusCode).toBe(200);

    const auditConsentLogs = await app.inject({
      method: 'GET',
      url: `/audit/logs?entity=consent&entityId=${consent.id}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(auditConsentLogs.statusCode).toBe(200);
    expect(auditConsentLogs.json().data.length).toBeGreaterThanOrEqual(2);

    const auditAttachmentLogs = await app.inject({
      method: 'GET',
      url: `/audit/logs?entity=attachment&entityId=${attachment.id}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(auditAttachmentLogs.statusCode).toBe(200);
    expect(auditAttachmentLogs.json().data.length).toBeGreaterThanOrEqual(2);
  });
});
