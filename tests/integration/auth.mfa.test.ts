import fs from 'fs';
import path from 'path';
import { authenticator } from 'otplib';
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
import { hashPassword } from '../../src/modules/users/service';

let app: FastifyInstance;

async function loadSchema() {
  const files = [
    path.join(__dirname, '../../artifacts/sql/0001_initial.sql'),
    path.join(__dirname, '../../artifacts/sql/0002_rbac_and_profiles.sql'),
    path.join(__dirname, '../../artifacts/sql/0005_password_reset_tokens.sql'),
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

async function createTestUser(email: string, password: string) {
  const userId = randomUUID();
  const passwordHash = await hashPassword(password);
  await pool.query(
    `insert into users (id, name, email, password_hash)
     values ($1, $2, $3, $4)`,
    [userId, 'MFA Tester', email, passwordHash],
  );
  return { id: userId };
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
  await pool.query('delete from user_totp_factors');
  await pool.query('delete from user_mfa_settings');
  await pool.query('delete from auth_mfa_sessions');
});

describe('MFA TOTP flow', () => {
  it('enforces TOTP verification during login', async () => {
    const email = `mfa-${Date.now()}@example.com`;
    const password = 'Initial123!';
    await createTestUser(email, password);

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password },
    });

    expect(loginResponse.statusCode).toBe(200);
    const loginBody = loginResponse.json();
    expect(loginBody.token).toBeDefined();

    const setupResponse = await app.inject({
      method: 'POST',
      url: '/auth/mfa/totp/setup',
      headers: {
        authorization: `Bearer ${loginBody.token}`,
      },
      payload: { label: 'Test Device' },
    });

    expect(setupResponse.statusCode).toBe(200);
    const { factorId, secret } = setupResponse.json() as { factorId: string; secret: string };
    expect(factorId).toBeDefined();
    expect(secret).toBeDefined();

    const validCode = authenticator.generate(secret);

    const confirmResponse = await app.inject({
      method: 'POST',
      url: '/auth/mfa/totp/confirm',
      headers: { authorization: `Bearer ${loginBody.token}` },
      payload: { factorId, code: validCode },
    });

    expect(confirmResponse.statusCode).toBe(200);
    expect(confirmResponse.json()).toEqual({ confirmed: true });

    const secondLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password },
    });

    expect(secondLogin.statusCode).toBe(200);
    const secondBody = secondLogin.json();
    expect(secondBody.mfaRequired).toBe(true);
    expect(secondBody.methods).toContain('totp');
    expect(secondBody.session).toHaveProperty('id');

    const invalidAttempt = await app.inject({
      method: 'POST',
      url: '/auth/mfa/totp/verify',
      payload: {
        sessionId: secondBody.session.id,
        code: '000000',
      },
    });

    expect(invalidAttempt.statusCode).toBe(401);

    const validAttempt = await app.inject({
      method: 'POST',
      url: '/auth/mfa/totp/verify',
      payload: {
        sessionId: secondBody.session.id,
        code: authenticator.generate(secret),
      },
    });

    expect(validAttempt.statusCode).toBe(200);
    const finalBody = validAttempt.json();
    expect(finalBody.token).toBeDefined();
    expect(finalBody.user).toMatchObject({ email });
  });
});
