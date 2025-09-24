import { createHmac } from 'node:crypto';

import { withTransaction } from '../db';
import { deriveAuditSigningKey } from './security/key-management';

export type AuditLogParams = {
  userId?: string | null;
  entity: string;
  entityId: string;
  action: string;
  beforeData?: unknown;
  afterData?: unknown;
  justification?: string | null;
};

let digestTableEnsured = false;

async function ensureDigestTable(client: import('pg').PoolClient): Promise<void> {
  if (digestTableEnsured) {
    return;
  }

  await client.query(
    `create table if not exists audit_log_digests (
        log_id bigint primary key references audit_logs(id) on delete cascade,
        digest text not null,
        previous_digest text,
        created_at timestamptz not null default now()
      )`,
  );

  digestTableEnsured = true;
}

export async function recordAuditLog(params: AuditLogParams): Promise<void> {
  await withTransaction(async (client) => {
    const result = await client.query<{ id: string; created_at: Date }>(
      `insert into audit_logs (user_id, entity, entity_id, action, before_data, after_data, justification)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id, created_at`,
      [
        params.userId ?? null,
        params.entity,
        params.entityId,
        params.action,
        params.beforeData ?? null,
        params.afterData ?? null,
        params.justification ?? null,
      ],
    );

    const log = result.rows[0]!;

    await ensureDigestTable(client);

    const previous = await client.query<{ digest: string | null }>(
      `select digest
         from audit_log_digests
        order by created_at desc
        limit 1`,
    );

    const previousDigest = previous.rows[0]?.digest ?? null;

    const payload = JSON.stringify({
      id: log.id,
      userId: params.userId ?? null,
      entity: params.entity,
      entityId: params.entityId,
      action: params.action,
      beforeData: params.beforeData ?? null,
      afterData: params.afterData ?? null,
      justification: params.justification ?? null,
      createdAt: log.created_at.toISOString(),
      previousDigest,
    });

    const digest = createHmac('sha256', deriveAuditSigningKey()).update(payload).digest('hex');

    await client.query(
      `insert into audit_log_digests (log_id, digest, previous_digest)
         values ($1, $2, $3)
         on conflict (log_id) do nothing`,
      [log.id, digest, previousDigest],
    );
  });
}
