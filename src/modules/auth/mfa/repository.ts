import type { PoolClient } from 'pg';
import { query } from '../../../db';

export type TotpFactorRecord = {
  id: string;
  userId: string;
  label: string | null;
  secret: string;
  confirmedAt: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

export type WebauthnCredentialRecord = {
  id: string;
  userId: string;
  name: string;
  credentialId: string;
  publicKey: string;
  signCount: number;
  transports: string[] | null;
  createdAt: string;
  lastUsedAt: string | null;
};

export type MfaSessionRecord = {
  id: string;
  userId: string;
  purpose: string;
  methods: string[];
  payload: any;
  challenge: string | null;
  challengeType: string | null;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
};

export type MfaSettingsRecord = {
  userId: string;
  preferredMethod: string | null;
  totpEnabled: boolean;
  webauthnEnabled: boolean;
};

function mapTotp(row: any): TotpFactorRecord {
  return {
    id: row.id,
    userId: row.user_id,
    label: row.label ?? null,
    secret: row.secret,
    confirmedAt: row.confirmed_at ? row.confirmed_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    lastUsedAt: row.last_used_at ? row.last_used_at.toISOString() : null,
  };
}

function mapWebauthn(row: any): WebauthnCredentialRecord {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    credentialId: row.credential_id,
    publicKey: row.public_key,
    signCount: Number(row.sign_count ?? 0),
    transports: row.transports ?? null,
    createdAt: row.created_at.toISOString(),
    lastUsedAt: row.last_used_at ? row.last_used_at.toISOString() : null,
  };
}

function mapSession(row: any): MfaSessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    purpose: row.purpose,
    methods: row.methods ?? [],
    payload: row.payload ?? null,
    challenge: row.challenge ?? null,
    challengeType: row.challenge_type ?? null,
    expiresAt: row.expires_at.toISOString(),
    consumedAt: row.consumed_at ? row.consumed_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
  };
}

type QueryExecutor = (sql: string, values: unknown[]) => Promise<{ rows: any[] }>;

function getExecutor(client?: PoolClient): QueryExecutor {
  if (client) {
    return (sql: string, values: unknown[]) => client.query(sql, values);
  }

  return (sql: string, values: unknown[]) => query(sql, values);
}

export async function getMfaSettings(userId: string): Promise<MfaSettingsRecord | null> {
  const { rows } = await query(
    `select user_id, preferred_method, totp_enabled, webauthn_enabled
       from user_mfa_settings
      where user_id = $1`,
    [userId],
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0]!;
  return {
    userId: row.user_id,
    preferredMethod: row.preferred_method ?? null,
    totpEnabled: Boolean(row.totp_enabled),
    webauthnEnabled: Boolean(row.webauthn_enabled),
  };
}

export async function upsertMfaSettings(params: {
  userId: string;
  preferredMethod?: string | null;
  totpEnabled?: boolean;
  webauthnEnabled?: boolean;
}, client?: PoolClient): Promise<MfaSettingsRecord> {
  const sql = `insert into user_mfa_settings (user_id, preferred_method, totp_enabled, webauthn_enabled)
               values ($1, $2, $3, $4)
               on conflict (user_id) do update set
                 preferred_method = coalesce(excluded.preferred_method, user_mfa_settings.preferred_method),
                 totp_enabled = coalesce(excluded.totp_enabled, user_mfa_settings.totp_enabled),
                 webauthn_enabled = coalesce(excluded.webauthn_enabled, user_mfa_settings.webauthn_enabled),
                 updated_at = now()
               returning user_id, preferred_method, totp_enabled, webauthn_enabled`;

  const initialValues = [
    params.userId,
    params.preferredMethod ?? null,
    params.totpEnabled ?? false,
    params.webauthnEnabled ?? false,
  ];

  const executor = getExecutor(client);
  const result = await executor(sql, initialValues);
  const row = result.rows[0]!;

  return {
    userId: row.user_id,
    preferredMethod: row.preferred_method ?? null,
    totpEnabled: Boolean(row.totp_enabled),
    webauthnEnabled: Boolean(row.webauthn_enabled),
  };
}

export async function createTotpFactor(params: {
  userId: string;
  secret: string;
  label?: string | null;
  client?: PoolClient;
}): Promise<TotpFactorRecord> {
  const executor = getExecutor(params.client);
  const { rows } = await executor(
    `insert into user_totp_factors (user_id, secret, label)
     values ($1, $2, $3)
     returning *`,
    [params.userId, params.secret, params.label ?? null],
  );

  return mapTotp(rows[0]);
}

export async function deleteUnconfirmedTotpFactors(userId: string, client?: PoolClient): Promise<void> {
  const executor = getExecutor(client);
  await executor('delete from user_totp_factors where user_id = $1 and confirmed_at is null', [userId]);
}

export async function listTotpFactors(userId: string, options?: { confirmedOnly?: boolean }): Promise<TotpFactorRecord[]> {
  const params: unknown[] = [userId];
  const where: string[] = ['user_id = $1'];
  if (options?.confirmedOnly) {
    where.push('confirmed_at is not null');
  }
  const { rows } = await query(
    `select * from user_totp_factors
      where ${where.join(' and ')}
      order by confirmed_at desc nulls last, created_at desc`,
    params,
  );
  return rows.map(mapTotp);
}

export async function getTotpFactorById(id: string): Promise<TotpFactorRecord | null> {
  const { rows } = await query('select * from user_totp_factors where id = $1', [id]);
  if (rows.length === 0) {
    return null;
  }
  return mapTotp(rows[0]);
}

export async function confirmTotpFactor(id: string, client?: PoolClient): Promise<TotpFactorRecord> {
  const executor = getExecutor(client);
  const { rows } = await executor(
    `update user_totp_factors
        set confirmed_at = now(), last_used_at = null
      where id = $1
      returning *`,
    [id],
  );
  return mapTotp(rows[0]);
}

export async function deleteTotpFactors(userId: string, client?: PoolClient): Promise<void> {
  const executor = getExecutor(client);
  await executor('delete from user_totp_factors where user_id = $1', [userId]);
}

export async function touchTotpFactorUsage(id: string): Promise<void> {
  await query('update user_totp_factors set last_used_at = now() where id = $1', [id]);
}

export async function createMfaSession(params: {
  userId: string;
  purpose: string;
  methods: string[];
  payload: unknown;
  expiresAt: Date;
  challenge?: string | null;
  challengeType?: string | null;
}): Promise<MfaSessionRecord> {
  const { rows } = await query(
    `insert into auth_mfa_sessions (user_id, purpose, methods, payload, expires_at, challenge, challenge_type)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning *`,
    [
      params.userId,
      params.purpose,
      params.methods,
      params.payload ?? null,
      params.expiresAt,
      params.challenge ?? null,
      params.challengeType ?? null,
    ],
  );

  return mapSession(rows[0]);
}

export async function updateSessionChallenge(params: {
  sessionId: string;
  challenge: string;
  challengeType?: string | null;
}): Promise<void> {
  await query(
    `update auth_mfa_sessions
        set challenge = $2,
            challenge_type = $3,
            updated_at = now()
      where id = $1`,
    [params.sessionId, params.challenge, params.challengeType ?? null],
  );
}

export async function markSessionConsumed(sessionId: string): Promise<void> {
  await query(
    `update auth_mfa_sessions
        set consumed_at = now()
      where id = $1`,
    [sessionId],
  );
}

export async function getMfaSession(sessionId: string): Promise<MfaSessionRecord | null> {
  const { rows } = await query('select * from auth_mfa_sessions where id = $1', [sessionId]);
  if (rows.length === 0) {
    return null;
  }
  return mapSession(rows[0]);
}

export async function deleteExpiredSessions(now: Date = new Date()): Promise<void> {
  await query('delete from auth_mfa_sessions where expires_at < $1 or consumed_at is not null', [now]);
}

export async function listWebauthnCredentials(userId: string): Promise<WebauthnCredentialRecord[]> {
  const { rows } = await query(
    `select * from user_webauthn_credentials
      where user_id = $1
      order by created_at asc`,
    [userId],
  );
  return rows.map(mapWebauthn);
}

export async function insertWebauthnCredential(params: {
  userId: string;
  name: string;
  credentialId: string;
  publicKey: string;
  signCount: number;
  transports?: string[] | null;
}): Promise<WebauthnCredentialRecord> {
  const { rows } = await query(
    `insert into user_webauthn_credentials (user_id, name, credential_id, public_key, sign_count, transports)
     values ($1, $2, $3, $4, $5, $6)
     returning *`,
    [params.userId, params.name, params.credentialId, params.publicKey, params.signCount, params.transports ?? null],
  );
  return mapWebauthn(rows[0]);
}

export async function updateWebauthnCredential(params: {
  credentialId: string;
  userId: string;
  signCount: number;
  lastUsedAt?: Date;
}): Promise<void> {
  await query(
    `update user_webauthn_credentials
        set sign_count = $3,
            last_used_at = $4
      where credential_id = $1
        and user_id = $2`,
    [params.credentialId, params.userId, params.signCount, params.lastUsedAt ?? new Date()],
  );
}

export async function deleteWebauthnCredential(params: { credentialId: string; userId: string }): Promise<void> {
  await query('delete from user_webauthn_credentials where credential_id = $1 and user_id = $2', [params.credentialId, params.userId]);
}

