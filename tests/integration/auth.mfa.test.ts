import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { authenticator } from 'otplib';

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
import { hashPassword } from '../../src/modules/users/service';

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

async function createTestUser(params: { email: string; password: string; name?: string }) {
  const userId = randomUUID();
  const passwordHash = await hashPassword(params.password);
  await pool.query(
    `insert into users (id, name, email, password_hash)
     values ($1, $2, $3, $4)`,
    [userId, params.name ?? 'Test User', params.email, passwordHash],
  );

  const roleId = await pool.query<{ id: number }>("select id from roles where slug = 'tecnica'");
  if (roleId.rowCount && roleId.rows[0]) {
    await pool.query(
      `insert into user_roles (user_id, role_id) values ($1, $2)`,
      [userId, roleId.rows[0].id],
    );
  }

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
  await pool.query('delete from mfa_webauthn_credentials');
  await pool.query('delete from mfa_totp_secrets');
  await pool.query('delete from mfa_methods');
  await pool.query('delete from mfa_challenges');
  await pool.query('delete from users where email like $1', ['test-mfa-%']);
});

describe('MFA authentication flows', () => {
  it('enforces TOTP verification when enabled for user', async () => {
    const email = `test-mfa-${Date.now()}@example.com`;
    const password = 'Secret123!';
    await createTestUser({ email, password });

    const initialLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password },
    });

    expect(initialLogin.statusCode).toBe(200);
    const { token: initialToken } = initialLogin.json() as { token: string };
    const authHeader = { authorization: `Bearer ${initialToken}` };

    const setup = await app.inject({
      method: 'POST',
      url: '/auth/mfa/totp/setup',
      headers: authHeader,
      payload: { label: 'Device A' },
    });

    expect(setup.statusCode).toBe(201);
    const setupBody = setup.json() as { secret: string; method: { id: string } };
    const totpCode = authenticator.generate(setupBody.secret);

    const confirm = await app.inject({
      method: 'POST',
      url: '/auth/mfa/totp/confirm',
      headers: authHeader,
      payload: { methodId: setupBody.method.id, code: totpCode },
    });

    expect(confirm.statusCode).toBe(200);

    const mfaLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password },
    });

    expect(mfaLogin.statusCode).toBe(202);
    const challenge = mfaLogin.json() as {
      mfaRequired: boolean;
      challengeId: string;
      methods: string[];
    };

    expect(challenge.mfaRequired).toBe(true);
    expect(challenge.methods).toContain('totp');

    const verify = await app.inject({
      method: 'POST',
      url: '/auth/mfa/verify',
      payload: {
        challengeId: challenge.challengeId,
        method: 'totp',
        code: authenticator.generate(setupBody.secret),
      },
    });

    expect(verify.statusCode).toBe(200);
    const verified = verify.json() as { token: string; refreshToken: string };
    expect(verified.token).toBeDefined();
    expect(verified.refreshToken).toBeDefined();
  });
});
