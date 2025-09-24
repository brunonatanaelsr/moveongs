import fs from 'fs';
import path from 'path';
import { createHash, randomUUID, randomBytes } from 'crypto';
import { compare } from 'bcryptjs';
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
  process.env.NOTIFICATIONS_EMAIL_RECIPIENTS = '';
  process.env.NOTIFICATIONS_WHATSAPP_NUMBERS = '';
  process.env.NOTIFICATIONS_WEBHOOK_TIMEOUT_MS = '100';
  return { mem: db, adapter };
});

vi.mock('pg', () => ({
  Pool: adapter.Pool,
  Client: adapter.Client,
}));

import { pool } from '../../src/db/pool';
import { seedDatabase } from '../../src/scripts/seed';
import { createApp } from '../../src/app';
import {
  getEmailDispatchHistory,
  resetNotificationDispatchHistory,
  waitForNotificationQueue,
} from '../../src/modules/notifications/service';
import { hashPassword } from '../../src/modules/users/service';

let app: FastifyInstance;

async function loadSchema() {
  const files = [
    path.join(__dirname, '../../artifacts/sql/0001_initial.sql'),
    path.join(__dirname, '../../artifacts/sql/0002_rbac_and_profiles.sql'),
    path.join(__dirname, '../../artifacts/sql/0005_password_reset_tokens.sql'),
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

async function createTestUser(params: { email: string; password: string; name?: string }) {
  const userId = randomUUID();
  const passwordHash = await hashPassword(params.password);
  await pool.query(
    `insert into users (id, name, email, password_hash)
     values ($1, $2, $3, $4)`,
    [userId, params.name ?? 'Test User', params.email, passwordHash],
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
  resetNotificationDispatchHistory();
  await pool.query('delete from password_reset_tokens');
});

describe('Password reset flows', () => {
  it('creates reset token and dispatches notification for existing user', async () => {
    const email = `user-${Date.now()}@example.com`;
    const user = await createTestUser({ email, password: 'Initial123!' });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/password/forgot',
      payload: {
        email,
        redirectTo: 'https://frontend.example/reset?lang=pt',
      },
    });

    expect(response.statusCode).toBe(202);

    await waitForNotificationQueue();

    const tokens = await pool.query<{ token_hash: string; expires_at: Date }>(
      'select token_hash, expires_at from password_reset_tokens where user_id = $1',
      [user.id],
    );

    expect(tokens.rowCount).toBe(1);
    expect(tokens.rows[0].expires_at).toBeInstanceOf(Date);

    const emails = getEmailDispatchHistory();
    expect(emails).toHaveLength(1);
    const emailDispatch = emails[0];
    expect(emailDispatch.recipients).toEqual([email]);
    expect(emailDispatch.eventType).toBe('auth.password_reset_requested');
    expect(emailDispatch.body).toContain('frontend.example/reset');
    expect(emailDispatch.body).toContain('lang=pt');

    const tokenMatch = emailDispatch.body.match(/token=([A-Za-z0-9]+)/);
    expect(tokenMatch?.[1]).toBeDefined();
    const rawToken = tokenMatch![1];
    const hashed = createHash('sha256').update(rawToken).digest('hex');
    expect(hashed).toBe(tokens.rows[0].token_hash);
  });

  it('resets password using a valid token and invalidates reuse', async () => {
    const email = `user-${Date.now()}@imm.local`;
    const user = await createTestUser({ email, password: 'OldPass123!' });

    const forgot = await app.inject({
      method: 'POST',
      url: '/auth/password/forgot',
      payload: { email },
    });

    expect(forgot.statusCode).toBe(202);
    await waitForNotificationQueue();

    const emails = getEmailDispatchHistory();
    const body = emails[0]?.body ?? '';
    const tokenMatch = body.match(/token=([A-Za-z0-9]+)/);
    expect(tokenMatch?.[1]).toBeDefined();
    const token = tokenMatch![1];

    const reset = await app.inject({
      method: 'POST',
      url: '/auth/password/reset',
      payload: {
        token,
        password: 'NewSecret456!',
      },
    });

    expect(reset.statusCode).toBe(204);

    const saved = await pool.query<{ password_hash: string }>(
      'select password_hash from users where id = $1',
      [user.id],
    );
    expect(saved.rowCount).toBe(1);
    const matches = await compare('NewSecret456!', saved.rows[0].password_hash);
    expect(matches).toBe(true);

    const tokens = await pool.query<{ used_at: Date | null }>(
      'select used_at from password_reset_tokens where user_id = $1',
      [user.id],
    );
    expect(tokens.rowCount).toBeGreaterThan(0);
    expect(tokens.rows[0].used_at).toBeInstanceOf(Date);

    const reuse = await app.inject({
      method: 'POST',
      url: '/auth/password/reset',
      payload: {
        token,
        password: 'AnotherPass789!',
      },
    });

    expect(reuse.statusCode).toBe(400);
    expect(reuse.json().message).toBe('Invalid or expired reset token');
  });

  it('rejects expired reset tokens', async () => {
    const email = `expired-${Date.now()}@imm.local`;
    const user = await createTestUser({ email, password: 'TempPass123!' });

    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() - 5 * 60 * 1000);

    await pool.query(
      `insert into password_reset_tokens (id, user_id, token_hash, expires_at)
       values ($1, $2, $3, $4)`,
      [randomUUID(), user.id, tokenHash, expiresAt],
    );

    const response = await app.inject({
      method: 'POST',
      url: '/auth/password/reset',
      payload: {
        token,
        password: 'NeverChanges123!',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toBe('Invalid or expired reset token');

    const saved = await pool.query<{ password_hash: string }>(
      'select password_hash from users where id = $1',
      [user.id],
    );
    expect(saved.rowCount).toBe(1);
    const stillMatches = await compare('TempPass123!', saved.rows[0].password_hash);
    expect(stillMatches).toBe(true);
  });
});
