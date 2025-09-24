import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { query, withTransaction } from '../../db';
import { AppError } from '../../shared/errors';

export type ThreadVisibility = 'internal' | 'project' | 'private';
export type MessageVisibility = 'internal' | 'project' | 'private';

export type ThreadMemberRecord = {
  id: string;
  name: string | null;
};

export type ThreadRecord = {
  id: string;
  scope: string;
  subject: string | null;
  visibility: ThreadVisibility;
  createdAt: string;
  createdBy: {
    id: string;
    name: string | null;
  };
  members: ThreadMemberRecord[];
};

export type MessageRecord = {
  id: string;
  threadId: string;
  author: {
    id: string;
    name: string | null;
  };
  body: string;
  visibility: MessageVisibility;
  isConfidential: boolean;
  createdAt: string;
  updatedAt: string;
};

function toIso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function mapThreadRow(row: any): ThreadRecord {
  return {
    id: row.id,
    scope: row.scope,
    subject: row.subject ?? null,
    visibility: (row.visibility ?? 'internal') as ThreadVisibility,
    createdAt: toIso(row.created_at),
    createdBy: {
      id: row.created_by,
      name: row.creator_display_name ?? row.creator_name ?? null,
    },
    members: [],
  };
}

function mapMemberRow(row: any): ThreadMemberRecord {
  return {
    id: row.user_id,
    name: row.member_display_name ?? row.member_name ?? null,
  };
}

function mapMessageRow(row: any): MessageRecord {
  return {
    id: row.id,
    threadId: row.thread_id,
    author: {
      id: row.author_id,
      name: row.author_display_name ?? row.author_name ?? null,
    },
    body: row.body,
    visibility: (row.visibility ?? 'internal') as MessageVisibility,
    isConfidential: Boolean(row.is_confidential),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

async function loadThreadMembers(threadIds: string[], client?: PoolClient): Promise<Map<string, ThreadMemberRecord[]>> {
  if (threadIds.length === 0) {
    return new Map();
  }

  const placeholders = threadIds.map((_, index) => `$${index + 1}`).join(', ');
  const sql = `select tm.thread_id,
            tm.user_id,
            u.name as member_name,
            coalesce(up.display_name, u.name) as member_display_name
       from thread_members tm
       join users u on u.id = tm.user_id
  left join user_profiles up on up.user_id = u.id
      where tm.thread_id in (${placeholders})`;
  const result = client
    ? await client.query(sql, threadIds)
    : await query(sql, threadIds);

  const rows = result.rows;
  const members = new Map<string, ThreadMemberRecord[]>();

  for (const row of rows) {
    if (!members.has(row.thread_id)) {
      members.set(row.thread_id, []);
    }

    members.get(row.thread_id)!.push(mapMemberRow(row));
  }

  return members;
}

export async function ensureUsersExist(userIds: string[]): Promise<void> {
  const uniqueIds = Array.from(new Set(userIds));
  if (uniqueIds.length === 0) {
    return;
  }

  const placeholders = uniqueIds.map((_, index) => `$${index + 1}`).join(', ');
  const { rows } = await query<{ id: string }>(
    `select id from users where id in (${placeholders})`,
    uniqueIds,
  );

  if (rows.length !== uniqueIds.length) {
    const found = new Set(rows.map((row) => row.id));
    const missing = uniqueIds.filter((id) => !found.has(id));
    throw new AppError(`Unknown users: ${missing.join(', ')}`, 400);
  }
}

export async function createThread(params: {
  scope: string;
  subject: string | null;
  visibility: ThreadVisibility;
  createdBy: string;
  memberIds: string[];
}): Promise<string> {
  return withTransaction(async (client) => {
    const threadId = randomUUID();
    await client.query(
      `insert into threads (id, scope, created_by, subject, visibility)
       values ($1, $2, $3, $4, $5)` ,
      [threadId, params.scope, params.createdBy, params.subject ?? null, params.visibility],
    );
    const memberIds = Array.from(new Set([...params.memberIds, params.createdBy]));

    for (const memberId of memberIds) {
      await client.query(
        `insert into thread_members (thread_id, user_id)
         values ($1, $2)
         on conflict do nothing`,
        [threadId, memberId],
      );
    }

    return threadId;
  });
}

export async function listThreadsForUser(userId: string, scope?: string): Promise<ThreadRecord[]> {
  const values: unknown[] = [userId];
  const conditions = ['tm.user_id = $1'];

  if (scope) {
    values.push(scope);
    conditions.push(`t.scope = $${values.length}`);
  }

  const { rows } = await query(
    `select t.id,
            t.scope,
            t.subject,
            t.visibility,
            t.created_at,
            t.created_by,
            creator.name as creator_name,
            coalesce(cp.display_name, creator.name) as creator_display_name
       from threads t
       join thread_members tm on tm.thread_id = t.id
       join users creator on creator.id = t.created_by
  left join user_profiles cp on cp.user_id = creator.id
      where ${conditions.join(' and ')}
      order by t.created_at desc, t.id desc`,
    values,
  );

  const threadIds = rows.map((row: any) => row.id);
  const members = await loadThreadMembers(threadIds);

  return rows.map((row: any) => {
    const thread = mapThreadRow(row);
    thread.members = members.get(row.id) ?? [];
    return thread;
  });
}

export async function getThreadById(threadId: string): Promise<ThreadRecord | null> {
  const { rows } = await query(
    `select t.id,
            t.scope,
            t.subject,
            t.visibility,
            t.created_at,
            t.created_by,
            creator.name as creator_name,
            coalesce(cp.display_name, creator.name) as creator_display_name
       from threads t
       join users creator on creator.id = t.created_by
  left join user_profiles cp on cp.user_id = creator.id
      where t.id = $1`,
    [threadId],
  );

  if (rows.length === 0) {
    return null;
  }

  const thread = mapThreadRow(rows[0]);
  const members = await loadThreadMembers([threadId]);
  thread.members = members.get(threadId) ?? [];
  return thread;
}

export async function isThreadMember(threadId: string, userId: string): Promise<boolean> {
  const { rows } = await query<{ exists: boolean }>(
    `select exists(
       select 1 from thread_members where thread_id = $1 and user_id = $2
     ) as exists`,
    [threadId, userId],
  );

  return rows[0]?.exists ?? false;
}

export async function listMessages(threadId: string): Promise<MessageRecord[]> {
  const { rows } = await query(
    `select m.id,
            m.thread_id,
            m.author_id,
            m.body,
            m.visibility,
            m.is_confidential,
            m.created_at,
            m.updated_at,
            u.name as author_name,
            coalesce(up.display_name, u.name) as author_display_name
       from messages m
       join users u on u.id = m.author_id
  left join user_profiles up on up.user_id = u.id
      where m.thread_id = $1
      order by m.created_at asc, m.id asc`,
    [threadId],
  );

  return rows.map((row: any) => mapMessageRow(row));
}

export async function getMessageById(messageId: string): Promise<MessageRecord | null> {
  const { rows } = await query(
    `select m.id,
            m.thread_id,
            m.author_id,
            m.body,
            m.visibility,
            m.is_confidential,
            m.created_at,
            m.updated_at,
            u.name as author_name,
            coalesce(up.display_name, u.name) as author_display_name
       from messages m
       join users u on u.id = m.author_id
  left join user_profiles up on up.user_id = u.id
      where m.id = $1`,
    [messageId],
  );

  if (rows.length === 0) {
    return null;
  }

  return mapMessageRow(rows[0]);
}

export async function createMessage(params: {
  threadId: string;
  authorId: string;
  body: string;
  visibility: MessageVisibility;
  isConfidential: boolean;
}): Promise<MessageRecord> {
  const messageId = randomUUID();
  await query(
    `insert into messages (id, thread_id, author_id, body, visibility, is_confidential)
     values ($1, $2, $3, $4, $5, $6)` ,
    [messageId, params.threadId, params.authorId, params.body, params.visibility, params.isConfidential],
  );

  const message = await getMessageById(messageId);
  if (!message) {
    throw new AppError('Failed to create message', 500);
  }
  return message;
}
