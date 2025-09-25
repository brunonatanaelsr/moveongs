import fs from 'fs';
import path from 'path';
import { beforeAll, afterAll, describe, expect, it, vi, beforeEach } from 'vitest';
import { hash } from 'bcryptjs';
import type { FastifyInstance } from 'fastify';

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
  process.env.JWT_SECRET = 'test-secret-imm-123456789012345678901234567890';
  process.env.JWT_EXPIRES_IN = '1h';
  process.env.DATABASE_URL = 'postgres://imm:test@localhost:5432/imm_test';
  process.env.LOG_LEVEL = 'silent';
  process.env.SEED_DEMO_DATA = 'true';
  return { mem: db, adapter };
});

vi.mock('pg', () => ({
  Pool: adapter.Pool,
  Client: adapter.Client,
}));

import { seedDatabase } from '../src/scripts/seed';
import { pool } from '../src/db/pool';
import { createApp } from '../src/app';

let app: FastifyInstance;

async function loadSchema() {
  const files = [
    path.join(__dirname, '../artifacts/sql/0001_initial.sql'),
    path.join(__dirname, '../artifacts/sql/0002_rbac_and_profiles.sql'),
    path.join(__dirname, '../artifacts/sql/0003_analytics_views.sql'),
    path.join(__dirname, '../artifacts/sql/0006_mfa_consent_reviews_dsr.sql'),
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

async function login(app: FastifyInstance, email: string, password: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password },
  });
  expect(response.statusCode).toBe(200);
  const body = response.json();
  return body.token as string;
}

beforeAll(async () => {
  await loadSchema();
  await seedDatabase();
  app = await createApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('Analytics routes', () => {
  it('allows admin to view overview', async () => {
    const token = await login(app, 'admin@imm.local', 'ChangeMe123!');
    const response = await app.inject({
      method: 'GET',
      url: '/analytics/overview',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.kpis).toHaveProperty('beneficiarias_ativas');
  });

  it('enforces project scope for educadora', async () => {
    const password = 'Educadora123!';
    const passwordHash = await hash(password, 12);
    const { rows: educator } = await pool.query<{ id: string }>(
      `insert into users (name, email, password_hash)
         values ($1, $2, $3)
         returning id`,
      ['Educadora Demo', 'educadora@imm.local', passwordHash],
    );
    const userId = educator[0]?.id;
    expect(userId).toBeDefined();

    const { rows: roleRows } = await pool.query<{ id: number }>(
      `select id from roles where slug = 'educadora'`,
    );
    const roleId = roleRows[0]?.id;
    const { rows: projectRows } = await pool.query<{ id: string }>(
      `select id from projects where slug = 'demo-artesanato'`,
    );
    const projectId = projectRows[0]?.id;

    await pool.query(
      `insert into user_roles (user_id, role_id, project_id)
         values ($1, $2, $3)
         on conflict do nothing`,
      [userId, roleId, projectId],
    );

    await pool.query(
      `insert into user_profiles (user_id, display_name)
         values ($1, 'Educadora Demo')
         on conflict do nothing`,
      [userId],
    );

    const token = await login(app, 'educadora@imm.local', password);

    const allowed = await app.inject({
      method: 'GET',
      url: `/analytics/overview?projectId=${projectId}`,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(allowed.statusCode).toBe(200);

    const denied = await app.inject({
      method: 'GET',
      url: '/analytics/overview?projectId=00000000-0000-0000-0000-000000000000',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(denied.statusCode).toBe(403);
  });

  it('denies access to recepcao role', async () => {
    const password = 'Recepcao123!';
    const passwordHash = await hash(password, 12);
    const { rows: userRows } = await pool.query<{ id: string }>(
      `insert into users (name, email, password_hash)
         values ($1, $2, $3)
         returning id`,
      ['Recepcao Demo', 'recepcao@imm.local', passwordHash],
    );
    const recepcaoId = userRows[0]?.id;

    const { rows: roleRows } = await pool.query<{ id: number }>(
      `select id from roles where slug = 'recepcao'`,
    );
    const roleId = roleRows[0]?.id;

    await pool.query(
      `insert into user_roles (user_id, role_id, project_id)
         values ($1, $2, null)
         on conflict do nothing`,
      [recepcaoId, roleId],
    );

    await pool.query(
      `insert into user_profiles (user_id, display_name)
         values ($1, 'Recepcao Demo')
         on conflict do nothing`,
      [recepcaoId],
    );

    const token = await login(app, 'recepcao@imm.local', password);
    const response = await app.inject({
      method: 'GET',
      url: '/analytics/overview',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it('exports CSV successfully', async () => {
    const token = await login(app, 'admin@imm.local', 'ChangeMe123!');
    const response = await app.inject({
      method: 'GET',
      url: '/analytics/export?format=csv',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
  });

  it('exports PDF successfully', async () => {
    const token = await login(app, 'admin@imm.local', 'ChangeMe123!');
    const response = await app.inject({
      method: 'GET',
      url: '/analytics/export?format=pdf',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
  });

  it('exports XLSX successfully', async () => {
    const token = await login(app, 'admin@imm.local', 'ChangeMe123!');
    const response = await app.inject({
      method: 'GET',
      url: '/analytics/export?format=xlsx',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });
});
