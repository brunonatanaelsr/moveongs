import type { PoolClient } from 'pg';

import { query } from '../../db';
import { getPIIEncryptionKey } from './key-management';

type DbExecutor = (sql: string, values: unknown[]) => Promise<any>;

function resolveExecutor(client?: PoolClient | null): DbExecutor {
  if (client) {
    return async (sql, values) => client.query(sql, values);
  }

  return async (sql, values) => query(sql, values);
}

export async function encryptPIIValues(
  values: Array<string | null | undefined>,
  client?: PoolClient | null,
): Promise<Array<string | null>> {
  const key = await getPIIEncryptionKey();

  const normalized = values.map((value) => (value == null ? null : String(value)));

  if (!key) {
    return normalized;
  }

  if (normalized.every((value) => value == null)) {
    return normalized;
  }

  const executor = resolveExecutor(client);
  const keyPlaceholder = `$${normalized.length + 1}`;
  const columns = normalized.map((_, index) => {
    const placeholder = `$${index + 1}`;
    return `case when ${placeholder} is null then null else 'pgp:' || encode(pgp_sym_encrypt(${placeholder}::text, ${keyPlaceholder}::text, 'cipher-algo=aes256, compress-algo=1'), 'base64') end as value${index}`;
  });

  const sql = `select ${columns.join(', ')}`;
  const params = [...normalized, key];
  const result = await executor(sql, params);
  const row = result.rows[0] ?? {};

  return normalized.map((value, index) => {
    const encrypted = row[`value${index}`];
    return encrypted ?? value;
  });
}

export async function decryptPIIValues(
  values: Array<string | null | undefined>,
  client?: PoolClient | null,
): Promise<Array<string | null>> {
  const key = await getPIIEncryptionKey();
  const normalized = values.map((value) => (value == null ? null : String(value)));

  if (!key) {
    return normalized;
  }

  const requiresDecrypt = normalized.some((value) => value != null && value.startsWith('pgp:'));
  if (!requiresDecrypt) {
    return normalized;
  }

  const executor = resolveExecutor(client);
  const keyPlaceholder = `$${normalized.length + 1}`;
  const columns = normalized.map((_, index) => {
    const placeholder = `$${index + 1}`;
    return `case when ${placeholder} is null then null when ${placeholder} like 'pgp:%' then convert_from(pgp_sym_decrypt(decode(substring(${placeholder} from 5), 'base64'), ${keyPlaceholder}::text, 'cipher-algo=aes256, compress-algo=1'), 'utf-8') else ${placeholder} end as value${index}`;
  });

  const sql = `select ${columns.join(', ')}`;
  const params = [...normalized, key];
  const result = await executor(sql, params);
  const row = result.rows[0] ?? {};

  return normalized.map((value, index) => {
    const decrypted = row[`value${index}`];
    return decrypted ?? value;
  });
}

export async function encryptPIIObject<T extends Record<string, any>>(
  data: T,
  fields: Array<keyof T>,
  client?: PoolClient | null,
): Promise<T> {
  const values = await encryptPIIValues(
    fields.map((field) => (data[field] == null ? null : String(data[field]))),
    client,
  );

  const clone = { ...data };
  fields.forEach((field, index) => {
    clone[field] = values[index] as T[typeof field];
  });

  return clone;
}

export async function decryptPIIObject<T extends Record<string, any>>(
  data: T,
  fields: Array<keyof T>,
  client?: PoolClient | null,
): Promise<T> {
  const values = await decryptPIIValues(fields.map((field) => data[field] as any), client);
  const clone = { ...data };
  fields.forEach((field, index) => {
    clone[field] = values[index] as T[typeof field];
  });
  return clone;
}
