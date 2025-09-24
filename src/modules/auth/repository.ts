import type { PoolClient, QueryResultRow } from 'pg';
import { query } from '../../db';

export type PasswordResetTokenRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

export type RefreshTokenRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
  replacedByTokenId: string | null;
};

function mapRow(row: {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}): PasswordResetTokenRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    createdAt: row.created_at,
  };
}

async function execute<T extends QueryResultRow>(
  sql: string,
  values: unknown[],
  client?: PoolClient,
): Promise<T[]> {
  if (client) {
    const result = await client.query<T>(sql, values);
    return result.rows;
  }

  const result = await query<T>(sql, values);
  return result.rows;
}

let refreshSchemaEnsured = false;

async function ensureRefreshTokenSchema(client?: PoolClient): Promise<void> {
  if (refreshSchemaEnsured) {
    return;
  }

  await execute(
    `create table if not exists auth_refresh_tokens (
        id uuid primary key,
        user_id uuid not null references users(id) on delete cascade,
        token_hash text not null unique,
        expires_at timestamptz not null,
        created_at timestamptz not null default now(),
        rotated_at timestamptz,
        revoked_at timestamptz,
        replaced_by_token_id uuid
      )`,
    [],
    client,
  );

  await execute(
    `create index if not exists idx_auth_refresh_tokens_user on auth_refresh_tokens(user_id)`,
    [],
    client,
  );

  refreshSchemaEnsured = true;
}

function mapRefreshToken(row: {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  created_at: Date;
  rotated_at: Date | null;
  revoked_at: Date | null;
  replaced_by_token_id: string | null;
}): RefreshTokenRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    rotatedAt: row.rotated_at,
    revokedAt: row.revoked_at,
    replacedByTokenId: row.replaced_by_token_id,
  };
}

export async function deletePasswordResetTokensForUser(
  userId: string,
  client?: PoolClient,
): Promise<void> {
  await execute('delete from password_reset_tokens where user_id = $1', [userId], client);
}

export async function deleteExpiredPasswordResetTokens(client?: PoolClient): Promise<void> {
  await execute('delete from password_reset_tokens where expires_at < now()', [], client);
}

export async function insertPasswordResetToken(
  params: { userId: string; tokenHash: string; expiresAt: Date },
  client?: PoolClient,
): Promise<PasswordResetTokenRecord> {
  const rows = await execute<{
    id: string;
    user_id: string;
    token_hash: string;
    expires_at: Date;
    used_at: Date | null;
    created_at: Date;
  }>(
    `insert into password_reset_tokens (user_id, token_hash, expires_at)
     values ($1, $2, $3)
     returning id, user_id, token_hash, expires_at, used_at, created_at`,
    [params.userId, params.tokenHash, params.expiresAt],
    client,
  );

  return mapRow(rows[0]!);
}

export async function findPasswordResetTokenByHash(
  tokenHash: string,
  client?: PoolClient,
): Promise<PasswordResetTokenRecord | null> {
  const rows = await execute<{
    id: string;
    user_id: string;
    token_hash: string;
    expires_at: Date;
    used_at: Date | null;
    created_at: Date;
  }>(
    `select id, user_id, token_hash, expires_at, used_at, created_at
       from password_reset_tokens
      where token_hash = $1`,
    [tokenHash],
    client,
  );

  if (rows.length === 0) {
    return null;
  }

  return mapRow(rows[0]!);
}

export async function markPasswordResetTokenUsed(
  tokenId: string,
  client?: PoolClient,
): Promise<void> {
  await execute(
    `update password_reset_tokens
        set used_at = now()
      where id = $1`,
    [tokenId],
    client,
  );
}

export async function insertRefreshTokenRecord(
  params: { id: string; userId: string; tokenHash: string; expiresAt: Date },
  client?: PoolClient,
): Promise<RefreshTokenRecord> {
  await ensureRefreshTokenSchema(client);

  const rows = await execute<{
    id: string;
    user_id: string;
    token_hash: string;
    expires_at: Date;
    created_at: Date;
    rotated_at: Date | null;
    revoked_at: Date | null;
    replaced_by_token_id: string | null;
  }>(
    `insert into auth_refresh_tokens (id, user_id, token_hash, expires_at)
       values ($1, $2, $3, $4)
       returning id, user_id, token_hash, expires_at, created_at, rotated_at, revoked_at, replaced_by_token_id`,
    [params.id, params.userId, params.tokenHash, params.expiresAt],
    client,
  );

  return mapRefreshToken(rows[0]!);
}

export async function findRefreshTokenByHash(
  tokenHash: string,
  client?: PoolClient,
): Promise<RefreshTokenRecord | null> {
  await ensureRefreshTokenSchema(client);
  const rows = await execute<{
    id: string;
    user_id: string;
    token_hash: string;
    expires_at: Date;
    created_at: Date;
    rotated_at: Date | null;
    revoked_at: Date | null;
    replaced_by_token_id: string | null;
  }>(
    `select id, user_id, token_hash, expires_at, created_at, rotated_at, revoked_at, replaced_by_token_id
       from auth_refresh_tokens
      where token_hash = $1`,
    [tokenHash],
    client,
  );

  if (rows.length === 0) {
    return null;
  }

  return mapRefreshToken(rows[0]!);
}

export async function findRefreshTokenById(
  id: string,
  client?: PoolClient,
): Promise<RefreshTokenRecord | null> {
  await ensureRefreshTokenSchema(client);
  const rows = await execute<{
    id: string;
    user_id: string;
    token_hash: string;
    expires_at: Date;
    created_at: Date;
    rotated_at: Date | null;
    revoked_at: Date | null;
    replaced_by_token_id: string | null;
  }>(
    `select id, user_id, token_hash, expires_at, created_at, rotated_at, revoked_at, replaced_by_token_id
       from auth_refresh_tokens
      where id = $1`,
    [id],
    client,
  );

  if (rows.length === 0) {
    return null;
  }

  return mapRefreshToken(rows[0]!);
}

export async function markRefreshTokenRotated(
  params: { id: string; replacedByTokenId: string },
  client?: PoolClient,
): Promise<void> {
  await ensureRefreshTokenSchema(client);
  await execute(
    `update auth_refresh_tokens
        set rotated_at = now(),
            replaced_by_token_id = $2
      where id = $1`,
    [params.id, params.replacedByTokenId],
    client,
  );
}

export async function revokeRefreshToken(
  id: string,
  client?: PoolClient,
): Promise<void> {
  await ensureRefreshTokenSchema(client);
  await execute(
    `update auth_refresh_tokens
        set revoked_at = now()
      where id = $1`,
    [id],
    client,
  );
}

export async function revokeRefreshTokensForUser(
  userId: string,
  client?: PoolClient,
): Promise<void> {
  await ensureRefreshTokenSchema(client);
  await execute(
    `update auth_refresh_tokens
        set revoked_at = now()
      where user_id = $1`,
    [userId],
    client,
  );
}
