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
  process.env.LOG_LEVEL = 'debug';
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

    const listDefaults = await app.inject({
      method: 'GET',
      url: '/form-templates',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(listDefaults.statusCode).toBe(200);
    const templates = listDefaults.json().data as Array<{
      formType: string;
      schemaVersion: string;
      schema: any;
    }>;

    const seededAnamnese = templates.find(
      (item) => item.formType === 'anamnese_social' && item.schemaVersion === 'v1',
    );
    const seededEvolucao = templates.find(
      (item) => item.formType === 'ficha_evolucao' && item.schemaVersion === 'v1',
    );

    expect(seededAnamnese).toBeTruthy();
    expect(seededAnamnese?.schema?.title).toBe('Anamnese Social');
    expect(seededEvolucao).toBeTruthy();
    expect(seededEvolucao?.schema?.title).toBe('Ficha de Evolução');

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

    const fichaSubmissionResponse = await app.inject({
      method: 'POST',
      url: `/beneficiaries/${beneficiaryId}/forms`,
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        formType: 'ficha_evolucao',
        schemaVersion: 'v1',
        payload: {
          identificacao_atendimento: {
            beneficiaria_nome: 'Beneficiária Form Teste',
            beneficiaria_id: beneficiaryId,
            data_atendimento: new Date().toISOString().slice(0, 10),
            profissional_responsavel: 'Admin IMM',
            tipo_atendimento: 'acolhimento',
          },
          descricao_atendimento: {
            relato_sessao: 'Primeiro atendimento e levantamento de demandas.',
            objetivos_trabalhados: ['acolhimento', 'escuta'],
          },
          avaliacao: {
            avaliacao_profissional: 'Participativa',
            encaminhamentos: [
              { descricao: 'Encaminhar para oficina de geração de renda' },
            ],
          },
        },
        signedBy: ['Admin IMM'],
        signedAt: [new Date().toISOString()],
      },
    });

    expect(fichaSubmissionResponse.statusCode).toBe(201);
    expect(fichaSubmissionResponse.json().submission).toMatchObject({
      beneficiaryId,
      formType: 'ficha_evolucao',
      schemaVersion: 'v1',
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
        expect.objectContaining({ formType: 'anamnese_social', schemaVersion: 'v1' }),
        expect.objectContaining({ formType: 'anamnese_social', schemaVersion: 'v2' }),
      ]),
    );

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
            data_nascimento: '1990-01-01',
            telefone_principal: '21999999999',
            endereco: {
              logradouro: 'Rua de Teste',
              bairro: 'Centro',
              cidade: 'Rio de Janeiro',
              estado: 'RJ',
            },
          },
          trabalho_renda: {
            ocupacao_principal: 'Artesã',
            renda_mensal: 600,
          },
          avaliacao_tecnica: {
            responsavel_preenchimento: 'Admin IMM',
            data_preenchimento: new Date().toISOString().slice(0, 10),
            necessidades_identificadas: ['Geração de renda', 'Apoio psicossocial'],
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

  it('manages action plans, evolutions and timeline', async () => {
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
      const beneficiaryResponse = await app.inject({
        method: 'POST',
        url: '/beneficiaries',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {
          fullName: 'Beneficiária Plano Teste',
          birthDate: '1992-02-10',
          vulnerabilities: [],
          householdMembers: [],
        },
      });

      if (beneficiaryResponse.statusCode !== 201) {
        // eslint-disable-next-line no-console
        console.log('beneficiary create error', beneficiaryResponse.json());
      }

      expect(beneficiaryResponse.statusCode).toBe(201);
      beneficiaryId = beneficiaryResponse.json().beneficiary.id as string;
      seededBeneficiaryId = beneficiaryId;
    }

    const planResponse = await app.inject({
      method: 'POST',
      url: '/action-plans',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        beneficiaryId,
      },
    });

    expect(planResponse.statusCode).toBe(201);
    const { plan: createdPlan } = planResponse.json();
    expect(createdPlan).toMatchObject({ beneficiaryId, status: 'active' });

    const addItemResponse = await app.inject({
      method: 'POST',
      url: `/action-plans/${createdPlan.id}/items`,
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        title: 'Realizar visita domiciliar',
        responsible: 'Técnica IMM',
        dueDate: '2020-01-01',
        notes: 'Verificar documentação',
      },
    });

    expect(addItemResponse.statusCode).toBe(201);
    const planAfterItemResponse = await app.inject({
      method: 'GET',
      url: `/action-plans/${createdPlan.id}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(planAfterItemResponse.statusCode).toBe(200);
    const planWithItem = planAfterItemResponse.json().plan;
    expect(planWithItem.items).toHaveLength(1);
    const itemId = planWithItem.items[0].id as string;

    const updateItemResponse = await app.inject({
      method: 'PATCH',
      url: `/action-plans/${createdPlan.id}/items/${itemId}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        dueDate: '2020-01-01',
        status: 'in_progress',
        support: 'Assistência jurídica',
      },
    });

    expect(updateItemResponse.statusCode).toBe(200);
    expect(updateItemResponse.json().plan.items[0]).toMatchObject({
      id: itemId,
      status: 'in_progress',
      support: 'Assistência jurídica',
    });

    const listPlansResponse = await app.inject({
      method: 'GET',
      url: `/beneficiaries/${beneficiaryId}/action-plans`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(listPlansResponse.statusCode).toBe(200);
    expect(listPlansResponse.json().data[0].items).toHaveLength(1);

    const summaryResponse = await app.inject({
      method: 'GET',
      url: `/beneficiaries/${beneficiaryId}/action-items/summary?status=in_progress`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(summaryResponse.statusCode).toBe(200);
    expect(summaryResponse.json().data[0]).toMatchObject({ id: itemId, status: 'in_progress' });

    const evolutionResponse = await app.inject({
      method: 'POST',
      url: `/beneficiaries/${beneficiaryId}/evolutions`,
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        date: '2025-09-01',
        description: 'Atendimento psicossocial inicial',
        category: 'psicossocial',
        responsible: 'Técnica IMM',
      },
    });

    expect(evolutionResponse.statusCode).toBe(201);

    const timelineResponse = await app.inject({
      method: 'GET',
      url: `/beneficiaries/${beneficiaryId}/timeline`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(timelineResponse.statusCode).toBe(200);
    const timeline = timelineResponse.json().data;
    const overdueBanner = timeline.find((entry: any) => entry.kind === 'system_alert' && entry.metadata?.alertType === 'action_plan_overdue');
    expect(overdueBanner).toMatchObject({
      status: 'alert',
      metadata: expect.objectContaining({
        overdueCount: 1,
        itemIds: expect.arrayContaining([itemId]),
      }),
    });

    const overdueItemEntry = timeline.find((entry: any) => entry.kind === 'action_item' && entry.id === itemId);
    expect(overdueItemEntry).toMatchObject({
      status: 'overdue',
      metadata: expect.objectContaining({
        actionPlanId: createdPlan.id,
        isOverdue: true,
        originalStatus: 'in_progress',
      }),
    });

    expect(timeline).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'action_item', metadata: expect.objectContaining({ actionPlanId: createdPlan.id }) }),
      expect.objectContaining({ kind: 'evolution', description: 'Atendimento psicossocial inicial' }),
    ]));

    const completeItemResponse = await app.inject({
      method: 'PATCH',
      url: `/action-plans/${createdPlan.id}/items/${itemId}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        status: 'done',
        completedAt: '2020-02-20',
      },
    });

    expect(completeItemResponse.statusCode).toBe(200);

    const timelineAfterCompletionResponse = await app.inject({
      method: 'GET',
      url: `/beneficiaries/${beneficiaryId}/timeline`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(timelineAfterCompletionResponse.statusCode).toBe(200);
    const timelineAfterCompletion = timelineAfterCompletionResponse.json().data;
    const bannerAfterCompletion = timelineAfterCompletion.find((entry: any) => entry.kind === 'system_alert' && entry.metadata?.alertType === 'action_plan_overdue');
    expect(bannerAfterCompletion).toBeUndefined();

    const completedItemEntry = timelineAfterCompletion.find((entry: any) => entry.kind === 'action_item' && entry.id === itemId);
    expect(completedItemEntry).toMatchObject({
      status: 'done',
      metadata: expect.objectContaining({
        isCompleted: true,
        originalStatus: 'done',
        isOverdue: false,
      }),
    });
  });
});
