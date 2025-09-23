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

async function createProject(name: string) {
  const id = randomUUID();
  await pool.query(
    `insert into projects (id, name) values ($1, $2)`,
    [id, name],
  );
  return id;
}

async function createUserWithRole(params: { email: string; name: string; role: string; projectId?: string | null }) {
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
    `insert into user_roles (id, user_id, role_id, project_id) values ($1, $2, $3, $4)` ,
    [randomUUID(), userId, roleId, params.projectId ?? null],
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

describe('Feed posts integration', () => {
  it('allows moderators to create posts, filter by project and view hidden posts', async () => {
    const adminToken = await login(app, 'admin@imm.local', 'ChangeMe123!');

    const projectId = await createProject('Projeto Visível');
    const otherProjectId = await createProject('Projeto Invisível');

    const generalResponse = await app.inject({
      method: 'POST',
      url: '/feed/posts',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        body: 'Comunicado geral',
        tags: ['geral'],
      },
    });
    expect(generalResponse.statusCode).toBe(201);
    const generalPostId = generalResponse.json().post.id as string;

    const projectResponse = await app.inject({
      method: 'POST',
      url: '/feed/posts',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        projectId,
        body: 'Atualização do projeto',
        visibility: 'project',
      },
    });
    expect(projectResponse.statusCode).toBe(201);
    const projectPostId = projectResponse.json().post.id as string;

    const hiddenResponse = await app.inject({
      method: 'POST',
      url: '/feed/posts',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        projectId,
        body: 'Post a ser moderado',
        visibility: 'project',
      },
    });
    expect(hiddenResponse.statusCode).toBe(201);
    const hiddenPostId = hiddenResponse.json().post.id as string;

    const otherProjectResponse = await app.inject({
      method: 'POST',
      url: '/feed/posts',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        projectId: otherProjectId,
        body: 'Atualização de outro projeto',
        visibility: 'project',
      },
    });
    expect(otherProjectResponse.statusCode).toBe(201);

    const hideModeration = await app.inject({
      method: 'DELETE',
      url: `/feed/posts/${hiddenPostId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(hideModeration.statusCode).toBe(200);

    const filtered = await app.inject({
      method: 'GET',
      url: `/feed/posts?projectId=${projectId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(filtered.statusCode).toBe(200);
    const filteredPosts = filtered.json().data as Array<{ id: string }>;
    expect(filteredPosts.map((post) => post.id)).toEqual(expect.arrayContaining([projectPostId]));
    expect(filteredPosts.some((post) => post.id === generalPostId)).toBe(false);
    expect(filteredPosts.some((post) => post.id === hiddenPostId)).toBe(false);

    const filteredWithHidden = await app.inject({
      method: 'GET',
      url: `/feed/posts?projectId=${projectId}&includeHidden=1`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(filteredWithHidden.statusCode).toBe(200);
    const filteredHiddenPosts = filteredWithHidden.json().data as Array<{ id: string }>;
    expect(filteredHiddenPosts.map((post) => post.id)).toEqual(expect.arrayContaining([projectPostId, hiddenPostId]));
    expect(filteredHiddenPosts.some((post) => post.id === generalPostId)).toBe(false);

    const listWithoutHidden = await app.inject({
      method: 'GET',
      url: '/feed/posts',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(listWithoutHidden.statusCode).toBe(200);
    const listWithoutHiddenPosts = listWithoutHidden.json().data as Array<{ id: string }>;
    expect(listWithoutHiddenPosts.some((post) => post.id === hiddenPostId)).toBe(false);
  });

  it('blocks includeHidden flag for non-moderators', async () => {
    const adminToken = await login(app, 'admin@imm.local', 'ChangeMe123!');

    const projectId = await createProject('Projeto Moderado');
    const hiddenResponse = await app.inject({
      method: 'POST',
      url: '/feed/posts',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        projectId,
        body: 'Post restrito',
        visibility: 'project',
      },
    });
    expect(hiddenResponse.statusCode).toBe(201);
    const hiddenPostId = hiddenResponse.json().post.id as string;

    const hide = await app.inject({
      method: 'DELETE',
      url: `/feed/posts/${hiddenPostId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(hide.statusCode).toBe(200);

    await createUserWithRole({
      email: 'educadora.feed.integration@imm.local',
      name: 'Educadora Feed Integration',
      role: 'educadora',
    });

    const educatorToken = await login(app, 'educadora.feed.integration@imm.local', 'Test123!');

    const forbidden = await app.inject({
      method: 'GET',
      url: '/feed/posts?includeHidden=1',
      headers: { Authorization: `Bearer ${educatorToken}` },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('creates comments and restricts hidden post visibility for non-moderators', async () => {
    const adminToken = await login(app, 'admin@imm.local', 'ChangeMe123!');

    const postResponse = await app.inject({
      method: 'POST',
      url: '/feed/posts',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        body: 'Post para comentários',
        tags: ['comentarios'],
      },
    });
    expect(postResponse.statusCode).toBe(201);
    const postId = postResponse.json().post.id as string;

    await createUserWithRole({
      email: 'educadora.comments@imm.local',
      name: 'Educadora Comments',
      role: 'educadora',
    });

    const educatorToken = await login(app, 'educadora.comments@imm.local', 'Test123!');

    const commentResponse = await app.inject({
      method: 'POST',
      url: `/feed/posts/${postId}/comments`,
      headers: { Authorization: `Bearer ${educatorToken}` },
      payload: {
        body: 'Comentário enviado pela educadora',
      },
    });
    expect(commentResponse.statusCode).toBe(201);

    const postBeforeHide = await app.inject({
      method: 'GET',
      url: `/feed/posts/${postId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(postBeforeHide.statusCode).toBe(200);
    const postDetails = postBeforeHide.json();
    expect(postDetails.comments).toEqual(expect.arrayContaining([
      expect.objectContaining({ body: 'Comentário enviado pela educadora' }),
    ]));

    const hide = await app.inject({
      method: 'DELETE',
      url: `/feed/posts/${postId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(hide.statusCode).toBe(200);

    const hiddenView = await app.inject({
      method: 'GET',
      url: `/feed/posts/${postId}`,
      headers: { Authorization: `Bearer ${educatorToken}` },
    });
    expect(hiddenView.statusCode).toBe(404);

    const moderatorView = await app.inject({
      method: 'GET',
      url: `/feed/posts/${postId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(moderatorView.statusCode).toBe(200);
    const moderatorBody = moderatorView.json();
    expect(moderatorBody.comments).toEqual(expect.arrayContaining([
      expect.objectContaining({ body: 'Comentário enviado pela educadora' }),
    ]));
  });
});
