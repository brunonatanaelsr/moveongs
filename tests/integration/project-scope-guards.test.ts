import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { hash } from 'bcryptjs';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.setConfig({ testTimeout: 20000, hookTimeout: 30000 });

const { mem, adapter } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { newDb } = require('pg-mem');
  const db = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = db.adapters.createPg();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { randomUUID: randomUUIDFn } = require('crypto');
  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: 'uuid',
    implementation: () => randomUUIDFn(),
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

async function login(appInstance: FastifyInstance, email: string, password: string): Promise<string> {
  const response = await appInstance.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password },
  });

  expect(response.statusCode).toBe(200);
  return response.json().token as string;
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
  await pool.query('delete from attendance');
  await pool.query('delete from enrollments');
  await pool.query('delete from cohorts');
  await pool.query('delete from projects');
  await pool.query('delete from beneficiaries');
  await pool.query("delete from user_roles where user_id in (select id from users where email like 'educadora.scope%@imm.local')");
  await pool.query("delete from user_profiles where user_id in (select id from users where email like 'educadora.scope%@imm.local')");
  await pool.query("delete from users where email like 'educadora.scope%@imm.local'");
});

describe('project scope guards', () => {
  it('prevents scoped users from accessing projects outside their delegation', async () => {
    const projectAllowedId = randomUUID();
    const projectDeniedId = randomUUID();

    await pool.query("insert into projects (id, name) values ($1, 'Projeto Permitido')", [projectAllowedId]);
    await pool.query("insert into projects (id, name) values ($1, 'Projeto Bloqueado')", [projectDeniedId]);

    const cohortAllowedId = randomUUID();
    const cohortDeniedId = randomUUID();

    await pool.query(
      `insert into cohorts (id, project_id, code, weekday, shift, start_time, end_time, capacity, location)
         values ($1, $2, 'COHORT-A', 1, 'manha', '08:00', '10:00', 20, 'Sala 1')`,
      [cohortAllowedId, projectAllowedId],
    );

    await pool.query(
      `insert into cohorts (id, project_id, code, weekday, shift, start_time, end_time, capacity, location)
         values ($1, $2, 'COHORT-B', 2, 'tarde', '14:00', '16:00', 18, 'Sala 2')`,
      [cohortDeniedId, projectDeniedId],
    );

    const beneficiaryAllowedId = randomUUID();
    const beneficiaryDeniedId = randomUUID();

    await pool.query(
      `insert into beneficiaries (id, full_name) values ($1, 'Beneficiária Permitida')`,
      [beneficiaryAllowedId],
    );
    await pool.query(
      `insert into beneficiaries (id, full_name) values ($1, 'Beneficiária Restrita')`,
      [beneficiaryDeniedId],
    );

    await pool.query(
      `insert into enrollments (id, beneficiary_id, cohort_id, status, enrolled_at)
         values ($1, $2, $3, 'active', current_date)` ,
      [randomUUID(), beneficiaryAllowedId, cohortAllowedId],
    );

    const deniedEnrollmentId = randomUUID();
    await pool.query(
      `insert into enrollments (id, beneficiary_id, cohort_id, status, enrolled_at)
         values ($1, $2, $3, 'active', current_date)` ,
      [deniedEnrollmentId, beneficiaryDeniedId, cohortDeniedId],
    );

    const educatorPassword = 'Scope123!';
    const educatorHash = await hash(educatorPassword, 12);
    const educatorId = randomUUID();

    await pool.query(
      `insert into users (id, name, email, password_hash)
         values ($1, 'Educadora Escopo', 'educadora.scope@imm.local', $2)` ,
      [educatorId, educatorHash],
    );
    await pool.query(
      `insert into user_profiles (user_id, display_name) values ($1, 'Educadora Escopo')`,
      [educatorId],
    );

    const { rows: roleRows } = await pool.query<{ id: number }>(`select id from roles where slug = 'educadora'`);
    const roleId = roleRows[0]?.id;
    expect(roleId).toBeDefined();

    await pool.query(
      `insert into user_roles (id, user_id, role_id, project_id)
         values ($1, $2, $3, $4)` ,
      [randomUUID(), educatorId, roleId, projectAllowedId],
    );

    const token = await login(app, 'educadora.scope@imm.local', educatorPassword);

    const allowedResponse = await app.inject({
      method: 'GET',
      url: `/enrollments?projectId=${projectAllowedId}`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(allowedResponse.statusCode).toBe(200);
    const allowedBody = allowedResponse.json();
    expect(Array.isArray(allowedBody.data)).toBe(true);
    expect(allowedBody.data).toHaveLength(1);
    expect(allowedBody.data[0].projectId).toBe(projectAllowedId);

    const forbiddenResponse = await app.inject({
      method: 'GET',
      url: `/enrollments?projectId=${projectDeniedId}`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(forbiddenResponse.statusCode).toBe(403);

    const beneficiariesResponse = await app.inject({
      method: 'GET',
      url: '/beneficiaries',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(beneficiariesResponse.statusCode).toBe(200);
    const beneficiariesBody = beneficiariesResponse.json();
    const beneficiaryNames = (beneficiariesBody.data as Array<{ fullName: string }>).map((item) => item.fullName);
    expect(beneficiaryNames).toContain('Beneficiária Permitida');
    expect(beneficiaryNames).not.toContain('Beneficiária Restrita');

    const deniedBeneficiaryView = await app.inject({
      method: 'GET',
      url: `/beneficiaries/${beneficiaryDeniedId}`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(deniedBeneficiaryView.statusCode).toBe(404);

    const deniedEnrollmentAttendance = await app.inject({
      method: 'GET',
      url: `/enrollments/${deniedEnrollmentId}/attendance`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(deniedEnrollmentAttendance.statusCode).toBe(404);
  });
});
