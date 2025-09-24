import type { PoolClient } from 'pg';
import { query, withTransaction } from '../../db';
import { encryptPIIObject, decryptPIIObject } from '../../shared/security/pii';

export type MfaMethodType = 'totp' | 'webauthn';

export type MfaMethodRecord = {
  id: string;
  userId: string;
  type: MfaMethodType;
  label: string | null;
  enabled: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TotpSecretRecord = {
  methodId: string;
  secret: string;
  confirmedAt: Date | null;
};

export type WebAuthnCredentialRecord = {
  id: string;
  methodId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string[] | null;
  attestationFormat: string | null;
  deviceName: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
};

type ChallengeRecord<T extends Record<string, unknown>> = {
  id: string;
  userId: string;
  purpose: string;
  challenge: T;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
};

type ClientOrPool = PoolClient | null | undefined;

function resolveClient(client?: ClientOrPool) {
  return client ?? null;
}

export async function createMfaMethod(params: {
  userId: string;
  type: MfaMethodType;
  label?: string | null;
  enabled?: boolean;
}, client?: ClientOrPool): Promise<MfaMethodRecord> {
  const executor = resolveClient(client);
  const sql = `insert into mfa_methods (user_id, type, label, enabled)
               values ($1, $2, $3, $4)
               returning id, user_id, type, label, enabled, last_used_at, created_at, updated_at`;
  const values = [params.userId, params.type, params.label ?? null, params.enabled ?? false];
  const result = executor ? await executor.query(sql, values) : await query(sql, values);

  const row = result.rows[0];
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    label: row.label,
    enabled: row.enabled,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function updateMfaMethod(params: {
  id: string;
  enabled?: boolean;
  label?: string | null;
  lastUsedAt?: Date | null;
}, client?: ClientOrPool): Promise<MfaMethodRecord | null> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  if (params.enabled !== undefined) {
    updates.push(`enabled = $${index++}`);
    values.push(params.enabled);
  }

  if (params.label !== undefined) {
    updates.push(`label = $${index++}`);
    values.push(params.label);
  }

  if (params.lastUsedAt !== undefined) {
    updates.push(`last_used_at = $${index++}`);
    values.push(params.lastUsedAt);
  }

  if (updates.length === 0) {
    return getMfaMethodById(params.id, client);
  }

  updates.push('updated_at = now()');
  values.push(params.id);

  const sql = `update mfa_methods
                 set ${updates.join(', ')}
               where id = $${index}
               returning id, user_id, type, label, enabled, last_used_at, created_at, updated_at`;

  const executor = resolveClient(client);
  const result = executor ? await executor.query(sql, values) : await query(sql, values);

  if (result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    label: row.label,
    enabled: row.enabled,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function deleteMfaMethod(id: string, client?: ClientOrPool): Promise<void> {
  const executor = resolveClient(client);
  if (executor) {
    await executor.query('delete from mfa_methods where id = $1', [id]);
    return;
  }

  await query('delete from mfa_methods where id = $1', [id]);
}

export async function getMfaMethodById(id: string, client?: ClientOrPool): Promise<MfaMethodRecord | null> {
  const executor = resolveClient(client);
  const sql = `select id, user_id, type, label, enabled, last_used_at, created_at, updated_at
                 from mfa_methods
                where id = $1`;
  const result = executor ? await executor.query(sql, [id]) : await query(sql, [id]);
  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    label: row.label,
    enabled: row.enabled,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listMfaMethodsByUser(userId: string, client?: ClientOrPool): Promise<MfaMethodRecord[]> {
  const executor = resolveClient(client);
  const sql = `select id, user_id, type, label, enabled, last_used_at, created_at, updated_at
                 from mfa_methods
                where user_id = $1
                order by created_at asc`;
  const result = executor ? await executor.query(sql, [userId]) : await query(sql, [userId]);
  return result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    type: row.type,
    label: row.label,
    enabled: row.enabled,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function saveTotpSecret(params: { methodId: string; secret: string }, client?: ClientOrPool): Promise<void> {
  await withTransaction(async (trx) => {
    const executor = resolveClient(client) ?? trx;
    const encrypted = await encryptPIIObject({ secret: params.secret }, ['secret'], executor);
    await executor.query(
      `insert into mfa_totp_secrets (method_id, secret)
       values ($1, $2)
       on conflict (method_id)
       do update set secret = excluded.secret, confirmed_at = null`,
      [params.methodId, encrypted.secret],
    );
    await executor.query(`update mfa_methods set updated_at = now() where id = $1`, [params.methodId]);
  });
}

export async function confirmTotpSecret(methodId: string, client?: ClientOrPool): Promise<void> {
  const executor = resolveClient(client);
  const sql = `update mfa_totp_secrets set confirmed_at = now() where method_id = $1`;
  if (executor) {
    await executor.query(sql, [methodId]);
  } else {
    await query(sql, [methodId]);
  }
}

export async function getTotpSecret(methodId: string, client?: ClientOrPool): Promise<TotpSecretRecord | null> {
  const executor = resolveClient(client);
  const sql = `select method_id, secret, confirmed_at from mfa_totp_secrets where method_id = $1`;
  const result = executor ? await executor.query(sql, [methodId]) : await query(sql, [methodId]);
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  const decrypted = await decryptPIIObject({ secret: row.secret }, ['secret'], executor ?? undefined);
  return {
    methodId: row.method_id,
    secret: decrypted.secret,
    confirmedAt: row.confirmed_at,
  };
}

export async function getActiveTotpMethodsByUser(userId: string, client?: ClientOrPool): Promise<Array<MfaMethodRecord & { secret: string }>> {
  const methods = await listMfaMethodsByUser(userId, client);
  const totpMethods = methods.filter((method) => method.type === 'totp' && method.enabled);
  const results: Array<MfaMethodRecord & { secret: string }> = [];
  for (const method of totpMethods) {
    const secret = await getTotpSecret(method.id, client);
    if (secret?.secret) {
      results.push({ ...method, secret: secret.secret });
    }
  }
  return results;
}

export async function insertWebAuthnCredential(params: {
  methodId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports?: string[] | null;
  attestationFormat?: string | null;
  deviceName?: string | null;
}): Promise<WebAuthnCredentialRecord> {
  const sql = `insert into mfa_webauthn_credentials (method_id, credential_id, public_key, counter, transports, attestation_format, device_name)
               values ($1, $2, $3, $4, $5, $6, $7)
               returning id, method_id, credential_id, public_key, counter, transports, attestation_format, device_name, created_at, last_used_at`;
  const values = [
    params.methodId,
    params.credentialId,
    params.publicKey,
    params.counter,
    params.transports ?? null,
    params.attestationFormat ?? null,
    params.deviceName ?? null,
  ];
  const result = await query(sql, values);
  const row = result.rows[0];
  return {
    id: row.id,
    methodId: row.method_id,
    credentialId: row.credential_id,
    publicKey: row.public_key,
    counter: Number(row.counter),
    transports: row.transports,
    attestationFormat: row.attestation_format,
    deviceName: row.device_name,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

export async function listWebAuthnCredentialsByMethod(methodId: string): Promise<WebAuthnCredentialRecord[]> {
  const sql = `select id, method_id, credential_id, public_key, counter, transports, attestation_format, device_name, created_at, last_used_at
                 from mfa_webauthn_credentials
                where method_id = $1`;
  const result = await query(sql, [methodId]);
  return result.rows.map((row) => ({
    id: row.id,
    methodId: row.method_id,
    credentialId: row.credential_id,
    publicKey: row.public_key,
    counter: Number(row.counter),
    transports: row.transports,
    attestationFormat: row.attestation_format,
    deviceName: row.device_name,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }));
}

export async function listWebAuthnCredentialsByUser(userId: string): Promise<WebAuthnCredentialRecord[]> {
  const sql = `select cred.id,
                      cred.method_id,
                      cred.credential_id,
                      cred.public_key,
                      cred.counter,
                      cred.transports,
                      cred.attestation_format,
                      cred.device_name,
                      cred.created_at,
                      cred.last_used_at
                 from mfa_webauthn_credentials cred
                 join mfa_methods method on method.id = cred.method_id
                where method.user_id = $1`;
  const result = await query(sql, [userId]);
  return result.rows.map((row) => ({
    id: row.id,
    methodId: row.method_id,
    credentialId: row.credential_id,
    publicKey: row.public_key,
    counter: Number(row.counter),
    transports: row.transports,
    attestationFormat: row.attestation_format,
    deviceName: row.device_name,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }));
}

export async function findWebAuthnCredentialById(id: string): Promise<WebAuthnCredentialRecord | null> {
  const sql = `select id, method_id, credential_id, public_key, counter, transports, attestation_format, device_name, created_at, last_used_at
                 from mfa_webauthn_credentials
                where id = $1`;
  const result = await query(sql, [id]);
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    methodId: row.method_id,
    credentialId: row.credential_id,
    publicKey: row.public_key,
    counter: Number(row.counter),
    transports: row.transports,
    attestationFormat: row.attestation_format,
    deviceName: row.device_name,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

export async function findWebAuthnCredentialByCredentialId(credentialId: string): Promise<WebAuthnCredentialRecord | null> {
  const sql = `select id, method_id, credential_id, public_key, counter, transports, attestation_format, device_name, created_at, last_used_at
                 from mfa_webauthn_credentials
                where credential_id = $1`;
  const result = await query(sql, [credentialId]);
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    methodId: row.method_id,
    credentialId: row.credential_id,
    publicKey: row.public_key,
    counter: Number(row.counter),
    transports: row.transports,
    attestationFormat: row.attestation_format,
    deviceName: row.device_name,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

export async function updateWebAuthnCredentialCounter(params: { id: string; counter: number; lastUsedAt?: Date | null }): Promise<void> {
  const values: unknown[] = [params.id, params.counter];
  let sql = 'update mfa_webauthn_credentials set counter = $2';
  if (params.lastUsedAt !== undefined) {
    values.push(params.lastUsedAt);
    sql += ', last_used_at = $3';
  }
  sql += ' where id = $1';
  await query(sql, values);
}

export async function deleteWebAuthnCredential(id: string): Promise<void> {
  await query('delete from mfa_webauthn_credentials where id = $1', [id]);
}

export async function createMfaChallenge<T extends Record<string, unknown>>(params: {
  userId: string;
  purpose: string;
  challenge: T;
  expiresAt: Date;
}): Promise<ChallengeRecord<T>> {
  const sql = `insert into mfa_challenges (user_id, purpose, challenge, expires_at)
               values ($1, $2, $3, $4)
               returning id, user_id, purpose, challenge, expires_at, consumed_at, created_at`;
  const result = await query(sql, [params.userId, params.purpose, params.challenge, params.expiresAt]);
  const row = result.rows[0];
  return {
    id: row.id,
    userId: row.user_id,
    purpose: row.purpose,
    challenge: row.challenge as T,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    createdAt: row.created_at,
  };
}

export async function getMfaChallengeById<T extends Record<string, unknown>>(id: string): Promise<ChallengeRecord<T> | null> {
  const sql = `select id, user_id, purpose, challenge, expires_at, consumed_at, created_at
                 from mfa_challenges
                where id = $1`;
  const result = await query(sql, [id]);
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    userId: row.user_id,
    purpose: row.purpose,
    challenge: row.challenge as T,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    createdAt: row.created_at,
  };
}

export async function consumeMfaChallenge(id: string): Promise<void> {
  await query('update mfa_challenges set consumed_at = now() where id = $1', [id]);
}

export async function deleteExpiredChallenges(reference: Date): Promise<void> {
  await query('delete from mfa_challenges where expires_at < $1', [reference]);
}
