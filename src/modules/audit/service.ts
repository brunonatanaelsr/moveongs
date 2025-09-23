import { AuditLogRecord, listAuditLogs } from './repository';

export async function fetchAuditLogs(params: {
  entity?: string;
  entityId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<AuditLogRecord[]> {
  const fromDate = params.from ? new Date(params.from) : undefined;
  const toDate = params.to ? new Date(params.to) : undefined;

  return listAuditLogs({
    entity: params.entity,
    entityId: params.entityId,
    from: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : undefined,
    to: toDate && !Number.isNaN(toDate.getTime()) ? toDate : undefined,
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
  });
}
