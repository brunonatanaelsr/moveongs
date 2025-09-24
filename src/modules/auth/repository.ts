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
