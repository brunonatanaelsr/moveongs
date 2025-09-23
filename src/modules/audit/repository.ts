import { query } from '../../db';

export type AuditLogRecord = {
  id: string;
  userId: string | null;
  entity: string;
  entityId: string;
  action: string;
  beforeData: unknown;
  afterData: unknown;
  justification: string | null;
  createdAt: string;
};

function mapAudit(row: any): AuditLogRecord {
  return {
    id: row.id.toString(),
    userId: row.user_id ?? null,
    entity: row.entity,
    entityId: row.entity_id,
    action: row.action,
    beforeData: row.before_data ?? null,
    afterData: row.after_data ?? null,
    justification: row.justification ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listAuditLogs(params: {
  entity?: string;
  entityId?: string;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}): Promise<AuditLogRecord[]> {
  const values: unknown[] = [];
  const filters: string[] = [];

  if (params.entity) {
    values.push(params.entity);
    filters.push(`entity = $${values.length}`);
  }

  if (params.entityId) {
    values.push(params.entityId);
    filters.push(`entity_id = $${values.length}`);
  }

  if (params.from) {
    values.push(params.from);
    filters.push(`created_at >= $${values.length}`);
  }

  if (params.to) {
    values.push(params.to);
    filters.push(`created_at <= $${values.length}`);
  }

  values.push(params.limit);
  values.push(params.offset);

  const where = filters.length > 0 ? `where ${filters.join(' and ')}` : '';

  const { rows } = await query(
    `select * from audit_logs
      ${where}
      order by created_at desc
      limit $${values.length - 1} offset $${values.length}`,
    values,
  );

  return rows.map(mapAudit);
}
