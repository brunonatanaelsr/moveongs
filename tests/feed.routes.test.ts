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
  process.env.SEED_DEMO_DATA = 'false';
  return { mem: db, adapter };
});

vi.mock('pg', () => ({
  Pool: adapter.Pool,
  Client: adapter.Client,
}));

import { pool } from '../src/db/pool';
import { seedDatabase } from '../src/scripts/seed';
import { createApp } from '../src/app';

async function loadSchema() {
  const files = [
    path.join(__dirname, '../artifacts/sql/0001_initial.sql'),
    path.join(__dirname, '../artifacts/sql/0002_rbac_and_profiles.sql'),
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

let app: FastifyInstance;

async function login(appInstance: FastifyInstance, email: string, password: string) {
  const response = await appInstance.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password },
  });

  expect(response.statusCode).toBe(200);
  return response.json().token as string;
}

async function createProjectWithEnrollment() {
  const projectId = randomUUID();
  await pool.query(
    `insert into projects (id, name) values ($1, 'Projeto Feed Teste')`,
    [projectId],
  );
  expect(projectId).toBeDefined();

  const cohortId = randomUUID();
  await pool.query(
    `insert into cohorts (id, project_id, code) values ($1, $2, 'T1')`,
    [cohortId, projectId],
  );
  expect(cohortId).toBeDefined();

  const beneficiaryId = randomUUID();
  await pool.query(
    `insert into beneficiaries (id, full_name) values ($1, 'Benef Feed')`,
    [beneficiaryId],
  );
  expect(beneficiaryId).toBeDefined();

  await pool.query(
    `insert into enrollments (beneficiary_id, cohort_id, status) values ($1, $2, 'active')`,
    [beneficiaryId, cohortId],
  );

  return { projectId, beneficiaryId };
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

describe('Feed routes', () => {
  it('allows admin to create and list posts', async () => {
    const token = await login(app, 'admin@imm.local', 'ChangeMe123!');

    const createResponse = await app.inject({
      method: 'POST',
      url: '/feed/posts',
      headers: { Authorization: `Bearer ${token}` },
      payload: {
        body: 'Primeiro comunicado institucional',
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json().post;
    expect(created.body).toBe('Primeiro comunicado institucional');

    const listResponse = await app.inject({
      method: 'GET',
      url: '/feed/posts',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(listResponse.statusCode).toBe(200);
    const body = listResponse.json();
    expect(body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.id })]));
  });

  it('blocks project posts when beneficiaries lack LGPD consent', async () => {
    const { projectId, beneficiaryId } = await createProjectWithEnrollment();
    const token = await login(app, 'admin@imm.local', 'ChangeMe123!');

    const blocked = await app.inject({
      method: 'POST',
      url: '/feed/posts',
      headers: { Authorization: `Bearer ${token}` },
      payload: {
        projectId,
        body: 'Atualização do projeto',
      },
    });

    expect(blocked.statusCode).toBe(422);

    await pool.query(
      `insert into consents (beneficiary_id, type, text_version, granted, granted_at) values ($1, 'lgpd', 'v1', true, now())`,
      [beneficiaryId],
    );

    const allowed = await app.inject({
      method: 'POST',
      url: '/feed/posts',
      headers: { Authorization: `Bearer ${token}` },
      payload: {
        projectId,
        body: 'Atualização liberada',
      },
    });

    expect(allowed.statusCode).toBe(201);
  });

  it('enforces project scope for educadora', async () => {
    const tokenAdmin = await login(app, 'admin@imm.local', 'ChangeMe123!');

    const scopedProjectId = randomUUID();
    await pool.query(
      `insert into projects (id, name) values ($1, 'Projeto Escopo')`,
      [scopedProjectId],
    );

    const otherProjectId = randomUUID();
    await pool.query(
      `insert into projects (id, name) values ($1, 'Projeto Sem Escopo')`,
      [otherProjectId],
    );

    const password = 'Educadora123!';
    const passwordHash = await hash(password, 12);
    const userId = randomUUID();
    await pool.query(
      `insert into users (id, name, email, password_hash) values ($1, 'Educadora Feed', 'educadora.feed@imm.local', $2)`,
      [userId, passwordHash],
    );

    await pool.query(
      `insert into user_profiles (user_id, display_name) values ($1, 'Educadora Feed')`,
      [userId],
    );

    const { rows: roleRows } = await pool.query<{ id: number }>(
      `select id from roles where slug = 'educadora'`,
    );
    const roleId = roleRows[0]?.id;
    expect(roleId).toBeDefined();

    await pool.query(
      `insert into user_roles (id, user_id, role_id, project_id) values ($1, $2, $3, $4)` ,
      [randomUUID(), userId, roleId, scopedProjectId],
    );

    const tokenEducadora = await login(app, 'educadora.feed@imm.local', password);

    const allowed = await app.inject({
      method: 'POST',
      url: '/feed/posts',
      headers: { Authorization: `Bearer ${tokenEducadora}` },
      payload: {
        projectId: scopedProjectId,
        body: 'Comunicado autorizado',
      },
    });

    expect(allowed.statusCode).toBe(201);

    const denied = await app.inject({
      method: 'POST',
      url: '/feed/posts',
      headers: { Authorization: `Bearer ${tokenEducadora}` },
      payload: {
        projectId: otherProjectId,
        body: 'Comunicado fora do escopo',
      },
    });

    expect(denied.statusCode).toBe(403);

    // admin can still post for other project
    const adminPost = await app.inject({
      method: 'POST',
      url: '/feed/posts',
      headers: { Authorization: `Bearer ${tokenAdmin}` },
      payload: {
        projectId: otherProjectId,
        body: 'Comunicado geral',
      },
    });
    expect(adminPost.statusCode).toBe(201);
  });

  it('requires moderation permission to view hidden posts', async () => {
    const adminToken = await login(app, 'admin@imm.local', 'ChangeMe123!');

    const createResponse = await app.inject({
      method: 'POST',
      url: '/feed/posts',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: { body: 'Post a ocultar' },
    });
    expect(createResponse.statusCode).toBe(201);
    const postId = createResponse.json().post.id as string;

    const hideResponse = await app.inject({
      method: 'DELETE',
      url: `/feed/posts/${postId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(hideResponse.statusCode).toBe(200);

    const listWithoutHidden = await app.inject({
      method: 'GET',
      url: '/feed/posts',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(listWithoutHidden.statusCode).toBe(200);
    expect(listWithoutHidden.json().data).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: postId })]));

    const listWithHidden = await app.inject({
      method: 'GET',
      url: '/feed/posts?includeHidden=1',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(listWithHidden.statusCode).toBe(200);
    expect(listWithHidden.json().data).toEqual(expect.arrayContaining([expect.objectContaining({ id: postId })]));

    const password = 'Recepcao123!';
    const passwordHash = await hash(password, 12);
    const recepcaoId = randomUUID();
    await pool.query(
      `insert into users (id, name, email, password_hash) values ($1, 'Recepcao Feed', 'recepcao.feed@imm.local', $2)`,
      [recepcaoId, passwordHash],
    );

    await pool.query(
      `insert into user_profiles (user_id, display_name) values ($1, 'Recepcao Feed')`,
      [recepcaoId],
    );

    const { rows: roleRows } = await pool.query<{ id: number }>(
      `select id from roles where slug = 'recepcao'`,
    );
    const recepcaoRoleId = roleRows[0]?.id;
    expect(recepcaoRoleId).toBeDefined();

    await pool.query(
      `insert into user_roles (id, user_id, role_id, project_id) values ($1, $2, $3, null)` ,
      [randomUUID(), recepcaoId, recepcaoRoleId],
    );

    const recepcaoToken = await login(app, 'recepcao.feed@imm.local', password);

    const deniedHidden = await app.inject({
      method: 'GET',
      url: '/feed/posts?includeHidden=1',
      headers: { Authorization: `Bearer ${recepcaoToken}` },
    });
    expect(deniedHidden.statusCode).toBe(403);
  });

  it('handles comments with author and moderator permissions', async () => {
    const adminToken = await login(app, 'admin@imm.local', 'ChangeMe123!');

    const createPost = await app.inject({
      method: 'POST',
      url: '/feed/posts',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: { body: 'Post com comentários' },
    });
    expect(createPost.statusCode).toBe(201);
    const postId = createPost.json().post.id as string;

    const commentResponse = await app.inject({
      method: 'POST',
      url: `/feed/posts/${postId}/comments`,
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: { body: 'Primeiro comentário' },
    });
    expect(commentResponse.statusCode).toBe(201);
    const commentId = commentResponse.json().comment.id as string;

    const password = 'Benef123!';
    const passwordHash = await hash(password, 12);
    const benefUserId = randomUUID();
    await pool.query(
      `insert into users (id, name, email, password_hash) values ($1, 'Benef Feed', 'benef.feed@imm.local', $2)`,
      [benefUserId, passwordHash],
    );

    await pool.query(
      `insert into user_profiles (user_id, display_name) values ($1, 'Benef Feed')`,
      [benefUserId],
    );

    const { rows: benefRoleRows } = await pool.query<{ id: number }>(
      `select id from roles where slug = 'beneficiaria'`,
    );
    const benefRoleId = benefRoleRows[0]?.id;
    expect(benefRoleId).toBeDefined();

    await pool.query(
      `insert into user_roles (id, user_id, role_id, project_id) values ($1, $2, $3, null)` ,
      [randomUUID(), benefUserId, benefRoleId],
    );

    const benefToken = await login(app, 'benef.feed@imm.local', password);

    const benefComment = await app.inject({
      method: 'POST',
      url: `/feed/posts/${postId}/comments`,
      headers: { Authorization: `Bearer ${benefToken}` },
      payload: { body: 'Comentário da beneficiária' },
    });
    expect(benefComment.statusCode).toBe(201);
    const benefCommentId = benefComment.json().comment.id as string;

    const deniedDeletion = await app.inject({
      method: 'DELETE',
      url: `/feed/comments/${commentId}`,
      headers: { Authorization: `Bearer ${benefToken}` },
    });
    expect(deniedDeletion.statusCode).toBe(403);

    const deleteOwn = await app.inject({
      method: 'DELETE',
      url: `/feed/comments/${benefCommentId}`,
      headers: { Authorization: `Bearer ${benefToken}` },
    });
    expect(deleteOwn.statusCode).toBe(200);

    const deleteByAdmin = await app.inject({
      method: 'DELETE',
      url: `/feed/comments/${commentId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(deleteByAdmin.statusCode).toBe(200);

    const getPost = await app.inject({
      method: 'GET',
      url: `/feed/posts/${postId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(getPost.statusCode).toBe(200);
    expect(getPost.json().comments).toEqual(expect.not.arrayContaining([expect.objectContaining({ id: commentId })]));
  });
});
