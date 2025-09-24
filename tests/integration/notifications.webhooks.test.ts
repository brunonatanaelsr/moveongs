import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hash } from 'bcryptjs';
import type { FastifyInstance } from 'fastify';

const { mem, adapter } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { newDb } = require('pg-mem');
  const db = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = db.adapters.createPg();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { randomUUID: uuidv4 } = require('crypto');
  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: 'uuid',
    implementation: () => uuidv4(),
  });
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-imm-123456789012345678901234567890';
  process.env.JWT_EXPIRES_IN = '1h';
  process.env.DATABASE_URL = 'postgres://imm:test@localhost:5432/imm_test';
  process.env.LOG_LEVEL = 'silent';
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
import { clearWebhookSubscriptions } from '../../src/modules/notifications/webhook-registry';

let app: FastifyInstance;

async function loadSchema() {
  const files = [
    path.join(__dirname, '../../artifacts/sql/0001_initial.sql'),
    path.join(__dirname, '../../artifacts/sql/0002_rbac_and_profiles.sql'),
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

async function login(email: string, password: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password },
  });

  expect(response.statusCode).toBe(200);
  return response.json() as { token: string; user: { permissions: Array<{ key: string }> } };
}

async function createUserWithRole(roleSlug: string) {
  const email = `${roleSlug}-${Date.now()}@imm.local`;
  const password = 'Secret123!';
  const passwordHash = await hash(password, 8);
  const userId = randomUUID();

  await pool.query(
    `insert into users (id, name, email, password_hash)
     values ($1, $2, $3, $4)` ,
    [userId, `Usuário ${roleSlug}`, email, passwordHash],
  );

  const roleResult = await pool.query<{ id: number }>(
    `select id from roles where slug = $1`,
    [roleSlug],
  );

  const roleId = roleResult.rows[0]?.id;
  if (!roleId) {
    throw new Error(`Role not found for tests: ${roleSlug}`);
  }

  await pool.query(
    `insert into user_roles (id, user_id, role_id, project_id)
     values ($1, $2, $3, null)
     on conflict do nothing`,
    [randomUUID(), userId, roleId],
  );

  return { email, password };
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
  clearWebhookSubscriptions();
});

describe('Notification webhook routes', () => {
  it('rejects unauthenticated requests', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/notifications/webhooks',
    });

    expect(response.statusCode).toBe(401);
  });

  it('rejects users without the webhook permission', async () => {
    const { email, password } = await createUserWithRole('tecnica');
    const { token } = await login(email, password);

    const listResponse = await app.inject({
      method: 'GET',
      url: '/notifications/webhooks',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(listResponse.statusCode).toBe(403);

    const createResponse = await app.inject({
      method: 'POST',
      url: '/notifications/webhooks',
      headers: { Authorization: `Bearer ${token}` },
      payload: {
        event: 'consent.recorded',
        url: 'https://example.com/webhooks/test',
      },
    });

    expect(createResponse.statusCode).toBe(403);
  });

  it('allows coordenacao role to manage notification webhooks', async () => {
    const { email, password } = await createUserWithRole('coordenacao');
    const loginResult = await login(email, password);
    const { token, user } = loginResult;

    expect(user.permissions).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'notifications:manage_webhooks' }),
    ]));

    const initialList = await app.inject({
      method: 'GET',
      url: '/notifications/webhooks',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(initialList.statusCode).toBe(200);
    expect(initialList.json()).toEqual({ data: [] });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/notifications/webhooks',
      headers: { Authorization: `Bearer ${token}` },
      payload: {
        event: 'consent.recorded',
        url: 'https://example.com/webhooks/imm',
        secret: 'shared-secret',
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json().webhook as { id: string };
    expect(created).toMatchObject({
      event: 'consent.recorded',
      url: 'https://example.com/webhooks/imm',
      secret: 'shared-secret',
    });

    const listAfterCreate = await app.inject({
      method: 'GET',
      url: '/notifications/webhooks',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(listAfterCreate.statusCode).toBe(200);
    expect(listAfterCreate.json().data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: created.id }),
    ]));

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/notifications/webhooks/${created.id}`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(deleteResponse.statusCode).toBe(204);

    const listAfterDelete = await app.inject({
      method: 'GET',
      url: '/notifications/webhooks',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(listAfterDelete.statusCode).toBe(200);
    expect(listAfterDelete.json()).toEqual({ data: [] });
  });
});
