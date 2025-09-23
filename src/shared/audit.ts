import { query } from '../db';

export type AuditLogParams = {
  userId?: string | null;
  entity: string;
  entityId: string;
  action: string;
  beforeData?: unknown;
  afterData?: unknown;
  justification?: string | null;
};

export async function recordAuditLog(params: AuditLogParams): Promise<void> {
  await query(
    `insert into audit_logs (user_id, entity, entity_id, action, before_data, after_data, justification)
     values ($1, $2, $3, $4, $5, $6, $7)`,
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
}
