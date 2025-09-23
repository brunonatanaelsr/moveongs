import fs from 'fs';
import path from 'path';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';

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

const redisMock = {
  status: 'ready',
  connect: vi.fn().mockResolvedValue(undefined),
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
};

vi.mock('../src/config/redis', () => ({
  getRedis: () => redisMock,
}));

import { seedDatabase } from '../src/scripts/seed';
import * as db from '../src/db';
import { pool } from '../src/db/pool';
import { getAnalyticsOverview } from '../src/modules/analytics/service';

async function loadSchema() {
  const files = [
    path.join(__dirname, '../artifacts/sql/0001_initial.sql'),
    path.join(__dirname, '../artifacts/sql/0002_rbac_and_profiles.sql'),
    path.join(__dirname, '../artifacts/sql/0003_analytics_views.sql'),
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

beforeAll(async () => {
  await loadSchema();
  await seedDatabase();
});

afterAll(async () => {
  await pool.end();
});

describe('analytics caching', () => {
  it('returns cached overview on subsequent calls', async () => {
    const querySpy = vi.spyOn(db, 'query');
    const filters = { from: '2024-05-01', to: '2024-06-01', allowedProjectIds: null, scopeKey: 'all' };

    redisMock.get.mockResolvedValueOnce(null);
    const first = await getAnalyticsOverview(filters);
    expect(first.kpis).toBeDefined();
    expect(redisMock.set).toHaveBeenCalled();

    redisMock.get.mockResolvedValueOnce(JSON.stringify(first));
    redisMock.set.mockClear();
    querySpy.mockClear();

    const second = await getAnalyticsOverview(filters);
    expect(second).toEqual(first);
    expect(redisMock.set).not.toHaveBeenCalled();
    expect(querySpy).not.toHaveBeenCalled();
  });
});
