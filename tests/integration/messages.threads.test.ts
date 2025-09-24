import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hash } from 'bcryptjs';
import type { FastifyInstance } from 'fastify';

vi.setConfig({ testTimeout: 20000, hookTimeout: 30000 });

const { mem, adapter } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { newDb } = require('pg-mem');
  const db = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = db.adapters.createPg();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { v4 } = require('uuid');
  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: 'uuid',
    implementation: () => v4(),
  });
  db.public.registerFunction({
    name: 'trim',
    args: ['text'],
    returns: 'text',
    implementation: (value: string | null) => (value ?? '').trim(),
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

import { pool } from '../../src/db/pool';
import { seedDatabase } from '../../src/scripts/seed';
import { createApp } from '../../src/app';

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

async function login(appInstance: FastifyInstance, email: string, password: string) {
  const response = await appInstance.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password },
  });

  expect(response.statusCode).toBe(200);
  return response.json().token as string;
}

async function createUserWithRole(params: { email: string; name: string; role: string }) {
  const password = 'Test123!';
  const passwordHash = await hash(password, 12);
  const userId = randomUUID();
  await pool.query(
    `insert into users (id, name, email, password_hash) values ($1, $2, $3, $4)`,
    [userId, params.name, params.email, passwordHash],
  );

  await pool.query(
    `insert into user_profiles (user_id, display_name) values ($1, $2)`,
    [userId, params.name],
  );

  const { rows } = await pool.query<{ id: number }>(
    `select id from roles where slug = $1`,
    [params.role],
  );

  const roleId = rows[0]?.id;
  expect(roleId).toBeDefined();

  await pool.query(
    `insert into user_roles (id, user_id, role_id) values ($1, $2, $3)` ,
    [randomUUID(), userId, roleId],
  );

  return { userId, password };
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

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('Messages module integration', () => {
  it('allows authorized users to create threads with initial messages', async () => {
    const tecnica = await createUserWithRole({ email: 'tecnica@imm.local', name: 'Técnica', role: 'tecnica' });
    const educadora = await createUserWithRole({ email: 'educadora@imm.local', name: 'Educadora', role: 'educadora' });

    const token = await login(app, 'tecnica@imm.local', tecnica.password);

    const response = await app.inject({
      method: 'POST',
      url: '/messages/threads',
      headers: { Authorization: `Bearer ${token}` },
      payload: {
        scope: 'beneficiary:123',
        subject: 'Acompanhamento familiar',
        memberIds: [educadora.userId],
        initialMessage: {
          body: 'Primeira mensagem confidencial',
          isConfidential: false,
        },
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.thread).toBeDefined();
    expect(body.thread.members).toHaveLength(2);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].body).toBe('Primeira mensagem confidencial');
  });

  it('allows members to post messages in an existing thread', async () => {
    const tecnica = await createUserWithRole({ email: 'tecnica2@imm.local', name: 'Técnica 2', role: 'tecnica' });
    const educadora = await createUserWithRole({ email: 'educadora2@imm.local', name: 'Educadora 2', role: 'educadora' });

    const tecnicaToken = await login(app, 'tecnica2@imm.local', tecnica.password);

    const threadResponse = await app.inject({
      method: 'POST',
      url: '/messages/threads',
      headers: { Authorization: `Bearer ${tecnicaToken}` },
      payload: {
        scope: 'project:alpha',
        subject: 'Caso João',
        memberIds: [educadora.userId],
        initialMessage: {
          body: 'Abrindo discussão do caso',
        },
      },
    });

    expect(threadResponse.statusCode).toBe(201);
    const threadId = threadResponse.json().thread.id as string;

    const educadoraToken = await login(app, 'educadora2@imm.local', educadora.password);

    const postResponse = await app.inject({
      method: 'POST',
      url: `/messages/threads/${threadId}/messages`,
      headers: { Authorization: `Bearer ${educadoraToken}` },
      payload: {
        body: 'Atualização realizada com a família',
      },
    });

    expect(postResponse.statusCode).toBe(201);

    const listResponse = await app.inject({
      method: 'GET',
      url: `/messages/threads/${threadId}/messages`,
      headers: { Authorization: `Bearer ${educadoraToken}` },
    });

    expect(listResponse.statusCode).toBe(200);
    const messages = listResponse.json().data as any[];
    expect(messages).toHaveLength(2);
    expect(messages[1].body).toBe('Atualização realizada com a família');
  });

  it('hides confidential messages from roles without clearance', async () => {
    const tecnica = await createUserWithRole({ email: 'tecnica3@imm.local', name: 'Técnica 3', role: 'tecnica' });
    const educadora = await createUserWithRole({ email: 'educadora3@imm.local', name: 'Educadora 3', role: 'educadora' });

    const tecnicaToken = await login(app, 'tecnica3@imm.local', tecnica.password);

    const threadResponse = await app.inject({
      method: 'POST',
      url: '/messages/threads',
      headers: { Authorization: `Bearer ${tecnicaToken}` },
      payload: {
        scope: 'beneficiary:456',
        subject: 'Caso confidencial',
        memberIds: [educadora.userId],
        initialMessage: {
          body: 'Registro inicial visível',
        },
      },
    });

    const threadId = threadResponse.json().thread.id as string;

    const confidentialResponse = await app.inject({
      method: 'POST',
      url: `/messages/threads/${threadId}/messages`,
      headers: { Authorization: `Bearer ${tecnicaToken}` },
      payload: {
        body: 'Detalhes sensíveis',
        isConfidential: true,
      },
    });

    expect(confidentialResponse.statusCode).toBe(201);

    const educadoraToken = await login(app, 'educadora3@imm.local', educadora.password);

    const educadoraView = await app.inject({
      method: 'GET',
      url: `/messages/threads/${threadId}/messages`,
      headers: { Authorization: `Bearer ${educadoraToken}` },
    });

    expect(educadoraView.statusCode).toBe(200);
    const educadoraMessages = educadoraView.json().data as any[];
    expect(educadoraMessages).toHaveLength(1);
    expect(educadoraMessages[0].body).toBe('Registro inicial visível');

    const tecnicaView = await app.inject({
      method: 'GET',
      url: `/messages/threads/${threadId}/messages`,
      headers: { Authorization: `Bearer ${tecnicaToken}` },
    });

    expect(tecnicaView.statusCode).toBe(200);
    const tecnicaMessages = tecnicaView.json().data as any[];
    expect(tecnicaMessages).toHaveLength(2);
    expect(tecnicaMessages[1].body).toBe('Detalhes sensíveis');
  });
});
