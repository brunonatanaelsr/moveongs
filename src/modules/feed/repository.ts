import { randomUUID } from 'crypto';
import { query, withTransaction } from '../../db';
import { AppError, NotFoundError } from '../../shared/errors';

export type PostVisibility = 'internal' | 'project' | 'public' | 'hidden';

export type PostRecord = {
  id: string;
  project: { id: string; name: string | null } | null;
  author: { id: string; name: string | null; avatarUrl: string | null };
  title: string | null;
  body: string | null;
  tags: string[];
  visibility: PostVisibility;
  publishedAt: string | null;
  commentCount: number;
};

export type CommentRecord = {
  id: string;
  postId: string;
  author: { id: string; name: string | null; avatarUrl: string | null };
  body: string;
  createdAt: string;
};

function parseTags(raw: unknown): string[] {
  if (!raw) {
    return [];
  }

  if (Array.isArray(raw)) {
    return raw.filter((value): value is string => typeof value === 'string');
  }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((value): value is string => typeof value === 'string');
      }
    } catch {
      // ignore parse errors and fall through
    }

    const trimmed = raw
      .replace(/[{}]/g, '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    return trimmed;
  }

  return [];
}

function toIso(value: any): string | null {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function mapPost(row: any): PostRecord {
  return {
    id: row.id,
    project: row.project_id
      ? { id: row.project_id, name: row.project_name ?? null }
      : null,
    author: {
      id: row.author_id,
      name: row.author_display_name ?? row.author_name ?? null,
      avatarUrl: row.author_avatar ?? null,
    },
    title: row.title ?? null,
    body: row.body ?? null,
    tags: parseTags(row.tags),
    visibility: (row.visibility ?? 'internal') as PostVisibility,
    publishedAt: toIso(row.published_at),
    commentCount: Number(row.comment_count ?? 0),
  };
}

function mapComment(row: any): CommentRecord {
  return {
    id: row.id,
    postId: row.post_id,
    author: {
      id: row.author_id,
      name: row.author_display_name ?? row.author_name ?? null,
      avatarUrl: row.author_avatar ?? null,
    },
    body: row.body,
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
  };
}

async function fetchPostById(id: string): Promise<PostRecord | null> {
  const { rows } = await query(
    `select posts.id,\n            posts.project_id,\n            posts.author_id,\n            posts.title,\n            posts.body,\n            posts.tags,\n            posts.published_at,\n            posts.visibility,\n            u.name as author_name,\n            coalesce(up.display_name, u.name) as author_display_name,\n            up.avatar_url as author_avatar,\n            pr.name as project_name\n       from posts\n       join users u on u.id = posts.author_id\n  left join user_profiles up on up.user_id = u.id\n  left join projects pr on pr.id = posts.project_id\n      where posts.id = $1`,
    [id],
  );

  if (rows.length === 0) {
    return null;
  }

  const countResult = await query<{ total: number }>(
    'select count(*)::int as total from comments where post_id = $1',
    [id],
  );

  const commentCount = countResult.rows[0]?.total ?? 0;
  return mapPost({ ...rows[0], comment_count: commentCount });
}

export async function getPostById(id: string): Promise<PostRecord | null> {
  return fetchPostById(id);
}

export async function listPosts(params: {
  projectId: string | null;
  allowedProjectIds: string[] | null;
  includeHidden: boolean;
  limit: number;
  offset: number;
}): Promise<PostRecord[]> {
  const values: unknown[] = [];
  const conditions: string[] = [];

  if (params.projectId) {
    values.push(params.projectId);
    conditions.push(`posts.project_id = $${values.length}`);
  } else if (params.allowedProjectIds && params.allowedProjectIds.length > 0) {
    values.push(params.allowedProjectIds);
    conditions.push(`(posts.project_id is null or posts.project_id = any($${values.length}::uuid[]))`);
  }

  if (!params.includeHidden) {
    values.push('hidden');
    conditions.push(`coalesce(posts.visibility, 'internal') <> $${values.length}`);
  }

  values.push(params.limit);
  values.push(params.offset);

  const whereClause = conditions.length > 0 ? `where ${conditions.join(' and ')}` : '';

  const { rows } = await query(
    `select posts.id,\n            posts.project_id,\n            posts.author_id,\n            posts.title,\n            posts.body,\n            posts.tags,\n            posts.published_at,\n            posts.visibility,\n            u.name as author_name,\n            coalesce(up.display_name, u.name) as author_display_name,\n            up.avatar_url as author_avatar,\n            pr.name as project_name\n       from posts\n       join users u on u.id = posts.author_id\n  left join user_profiles up on up.user_id = u.id\n  left join projects pr on pr.id = posts.project_id\n      ${whereClause}\n      order by posts.published_at desc nulls last, posts.id desc\n      limit $${values.length - 1} offset $${values.length}`,
    values,
  );

  const postIds = rows.map((row) => row.id);
  const commentCounts = new Map<string, number>();

  if (postIds.length > 0) {
    const countResult = await query<{ post_id: string; total: number }>(
      `select post_id, count(*)::int as total\n         from comments\n        where post_id = any($1::uuid[])\n        group by post_id`,
      [postIds],
    );

    for (const countRow of countResult.rows) {
      commentCounts.set(countRow.post_id, countRow.total);
    }
  }

  return rows.map((row) => mapPost({ ...row, comment_count: commentCounts.get(row.id) ?? 0 }));
}

export async function createPost(params: {
  authorId: string;
  projectId: string | null;
  title: string | null;
  body: string | null;
  tags: string[];
  visibility: PostVisibility;
  publishedAt: Date;
}): Promise<PostRecord> {
  const id = randomUUID();
  const { rows } = await query<{ id: string }>(
    `insert into posts (id, project_id, author_id, title, body, tags, visibility, published_at)\n     values ($1, $2, $3, $4, $5, $6, $7, $8)\n     returning id`,
    [
      id,
      params.projectId ?? null,
      params.authorId,
      params.title ?? null,
      params.body ?? null,
      params.tags.length > 0 ? params.tags : null,
      params.visibility,
      params.publishedAt,
    ],
  );

  const insertedId = rows[0]?.id ?? id;
  if (!insertedId) {
    throw new AppError('Failed to create post');
  }

  const post = await fetchPostById(insertedId);
  if (!post) {
    throw new AppError('Failed to load post after creation');
  }

  return post;
}

export async function updatePost(id: string, params: {
  projectId?: string | null;
  title?: string | null;
  body?: string | null;
  tags?: string[];
  visibility?: PostVisibility;
  publishedAt?: Date | null;
}): Promise<PostRecord> {
  return withTransaction(async (client) => {
    const current = await client.query(
      'select * from posts where id = $1 for update',
      [id],
    );

    if (current.rowCount === 0) {
      throw new NotFoundError('Post not found');
    }

    const row = current.rows[0];

    const projectId = params.projectId !== undefined ? params.projectId : row.project_id;
    const title = params.title !== undefined ? params.title : row.title;
    const body = params.body !== undefined ? params.body : row.body;
    const tags = params.tags !== undefined ? params.tags : parseTags(row.tags);
    const visibility = params.visibility ?? (row.visibility ?? 'internal');
    const publishedAt = params.publishedAt !== undefined && params.publishedAt !== null
      ? params.publishedAt
      : row.published_at;

    await client.query(
      `update posts set\n         project_id = $2,\n         title = $3,\n         body = $4,\n         tags = $5,\n         visibility = $6,\n         published_at = $7\n       where id = $1`,
      [id, projectId ?? null, title ?? null, body ?? null, tags && tags.length > 0 ? tags : null, visibility, publishedAt],
    );

    return fetchPostById(id);
  });
}

export async function deletePost(id: string): Promise<void> {
  await query('delete from posts where id = $1', [id]);
}

export async function listComments(postId: string): Promise<CommentRecord[]> {
  const { rows } = await query(
    `select c.*,\n            u.name as author_name,\n            coalesce(up.display_name, u.name) as author_display_name,\n            up.avatar_url as author_avatar\n       from comments c\n       join users u on u.id = c.author_id\n  left join user_profiles up on up.user_id = u.id\n      where c.post_id = $1\n      order by c.created_at asc, c.id asc`,
    [postId],
  );

  return rows.map(mapComment);
}

export async function createComment(params: {
  postId: string;
  authorId: string;
  body: string;
}): Promise<CommentRecord> {
  const id = randomUUID();
  const { rows } = await query<{ id: string }>(
    `insert into comments (id, post_id, author_id, body)\n     values ($1, $2, $3, $4)\n     returning id`,
    [id, params.postId, params.authorId, params.body],
  );

  const insertedId = rows[0]?.id ?? id;
  if (!insertedId) {
    throw new AppError('Failed to create comment');
  }

  const { rows: commentRows } = await query(
    `select c.*,\n            u.name as author_name,\n            coalesce(up.display_name, u.name) as author_display_name,\n            up.avatar_url as author_avatar\n       from comments c\n       join users u on u.id = c.author_id\n  left join user_profiles up on up.user_id = u.id\n      where c.id = $1`,
    [insertedId],
  );

  if (commentRows.length === 0) {
    throw new AppError('Failed to load comment after creation');
  }

  return mapComment(commentRows[0]);
}

export async function getCommentById(id: string): Promise<CommentRecord | null> {
  const { rows } = await query(
    `select c.*,\n            u.name as author_name,\n            coalesce(up.display_name, u.name) as author_display_name,\n            up.avatar_url as author_avatar\n       from comments c\n       join users u on u.id = c.author_id\n  left join user_profiles up on up.user_id = u.id\n      where c.id = $1`,
    [id],
  );

  if (rows.length === 0) {
    return null;
  }

  return mapComment(rows[0]);
}

export async function deleteComment(id: string): Promise<void> {
  await query('delete from comments where id = $1', [id]);
}

export async function listBeneficiaryProjects(beneficiaryId: string): Promise<string[]> {
  const { rows } = await query<{ project_id: string | null }>(
    `select distinct c.project_id\n       from enrollments e\n       join cohorts c on c.id = e.cohort_id\n      where e.beneficiary_id = $1\n        and e.status = 'active'`,
    [beneficiaryId],
  );

  return rows.map((row) => row.project_id).filter((value): value is string => Boolean(value));
}

export async function countPendingLgpdConsents(projectId: string): Promise<number> {
  const { rows } = await query<{ total: number }>(
    `with active as (\n       select distinct e.beneficiary_id\n         from enrollments e\n         join cohorts c on c.id = e.cohort_id\n        where c.project_id = $1\n          and e.status = 'active'\n     )\n     select count(*)::int as total\n       from active a\n       left join consents c\n         on c.beneficiary_id = a.beneficiary_id\n        and c.type = 'lgpd'\n        and c.granted = true\n        and c.revoked_at is null\n      where c.id is null`,
    [projectId],
  );

  return rows[0]?.total ?? 0;
}
