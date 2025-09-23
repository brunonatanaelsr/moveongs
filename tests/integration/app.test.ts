import fs from 'fs';
import path from 'path';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
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
  });
});
