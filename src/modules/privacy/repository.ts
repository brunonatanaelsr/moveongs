import { query, withTransaction } from '../../db';
import { AppError } from '../../shared/errors';

export type DataSubjectRequestRecord = {
  id: string;
  beneficiaryId: string;
  requestedBy: string | null;
  requestType: string;
  status: string;
  requestedAt: string;
  dueAt: string;
  completedAt: string | null;
  slaBreached: boolean;
  metadata: Record<string, unknown> | null;
};

export type DataSubjectRequestExportRecord = {
  requestId: string;
  exportedAt: string;
  payload: unknown;
};

function toIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  throw new AppError('Invalid timestamp value');
}

function mapRequest(row: any): DataSubjectRequestRecord {
  return {
    id: row.id,
    beneficiaryId: row.beneficiary_id,
    requestedBy: row.requested_by ?? null,
    requestType: row.request_type,
    status: row.status,
    requestedAt: toIso(row.requested_at),
    dueAt: toIso(row.due_at),
    completedAt: row.completed_at ? toIso(row.completed_at) : null,
    slaBreached: Boolean(row.sla_breached),
    metadata: row.metadata ?? null,
  };
}

export async function insertDataSubjectRequest(params: {
  beneficiaryId: string;
  requestedBy?: string | null;
  requestType: string;
  dueAt: Date;
  metadata?: Record<string, unknown> | null;
}): Promise<DataSubjectRequestRecord> {
  return withTransaction(async (client) => {
    const beneficiary = await client.query('select id from beneficiaries where id = $1', [params.beneficiaryId]);
    if (beneficiary.rowCount === 0) {
      throw new AppError('Beneficiary not found', 404);
    }

    const { rows } = await client.query(
      `insert into data_subject_requests (beneficiary_id, requested_by, request_type, due_at, metadata)
       values ($1, $2, $3, $4, $5)
       returning *`,
      [
        params.beneficiaryId,
        params.requestedBy ?? null,
        params.requestType,
        params.dueAt,
        params.metadata ?? null,
      ],
    );

    return mapRequest(rows[0]);
  });
}

export async function updateDataSubjectRequestStatus(params: {
  requestId: string;
  status: string;
  completedAt?: Date | null;
  slaBreached?: boolean;
  metadata?: Record<string, unknown> | null;
}): Promise<DataSubjectRequestRecord> {
  const fields: string[] = ['status = $2'];
  const values: unknown[] = [params.requestId, params.status];

  if (params.completedAt !== undefined) {
    values.push(params.completedAt);
    fields.push(`completed_at = $${values.length}`);
  }

  if (params.slaBreached !== undefined) {
    values.push(params.slaBreached);
    fields.push(`sla_breached = $${values.length}`);
  }

  if (params.metadata !== undefined) {
    values.push(params.metadata ?? null);
    fields.push(`metadata = $${values.length}`);
  }

  const { rows } = await query(
    `update data_subject_requests
        set ${fields.join(', ')}
      where id = $1
      returning *`,
    values,
  );

  if (rows.length === 0) {
    throw new AppError('Data subject request not found', 404);
  }

  return mapRequest(rows[0]);
}

export async function getDataSubjectRequestById(id: string): Promise<DataSubjectRequestRecord | null> {
  const { rows } = await query('select * from data_subject_requests where id = $1', [id]);
  if (rows.length === 0) {
    return null;
  }
  return mapRequest(rows[0]);
}

export async function insertDataSubjectRequestExport(params: {
  requestId: string;
  payload: unknown;
}): Promise<DataSubjectRequestExportRecord> {
  const { rows } = await query(
    `insert into data_subject_request_exports (request_id, payload)
     values ($1, $2)
     returning request_id, exported_at, payload`,
    [params.requestId, params.payload],
  );

  return {
    requestId: rows[0].request_id,
    exportedAt: toIso(rows[0].exported_at),
    payload: rows[0].payload,
  };
}

export async function getDataSubjectRequestExport(requestId: string): Promise<DataSubjectRequestExportRecord | null> {
  const { rows } = await query(
    `select request_id, exported_at, payload
       from data_subject_request_exports
      where request_id = $1`,
    [requestId],
  );

  if (rows.length === 0) {
    return null;
  }

  return {
    requestId: rows[0].request_id,
    exportedAt: toIso(rows[0].exported_at),
    payload: rows[0].payload,
  };
}

export async function listOpenDataSubjectRequests(): Promise<DataSubjectRequestRecord[]> {
  const { rows } = await query(
    `select *
       from data_subject_requests
      where status <> 'completed'
      order by due_at asc`,
    [],
  );

  return rows.map(mapRequest);
}

export async function collectBeneficiaryDataset(beneficiaryId: string): Promise<Record<string, unknown>> {
  const beneficiaryResult = await query('select * from beneficiaries where id = $1', [beneficiaryId]);
  if (beneficiaryResult.rows.length === 0) {
    throw new AppError('Beneficiary not found', 404);
  }

  const beneficiary = normalizeRow(beneficiaryResult.rows[0]);
  const household = (await query('select * from household_members where beneficiary_id = $1', [beneficiaryId])).rows.map(normalizeRow);
  const consents = (await query('select * from consents where beneficiary_id = $1 order by granted_at desc', [beneficiaryId])).rows.map(normalizeRow);
  const enrollments = (await query('select * from enrollments where beneficiary_id = $1', [beneficiaryId])).rows.map(normalizeRow);
  const attendance = (await query(
    `select a.*
       from attendance a
       join enrollments e on e.id = a.enrollment_id
      where e.beneficiary_id = $1
      order by a.date desc`,
    [beneficiaryId],
  )).rows.map(normalizeRow);
  const forms = (await query('select * from form_submissions where beneficiary_id = $1', [beneficiaryId])).rows.map(normalizeRow);
  const actionPlans = (await query('select * from action_plans where beneficiary_id = $1', [beneficiaryId])).rows.map(normalizeRow);
  const actionItems = (await query(
    `select ai.*
       from action_items ai
       join action_plans ap on ap.id = ai.action_plan_id
      where ap.beneficiary_id = $1`,
    [beneficiaryId],
  )).rows.map(normalizeRow);
  const evolutions = (await query('select * from evolutions where beneficiary_id = $1', [beneficiaryId])).rows.map(normalizeRow);
  const auditLogs = (await query(
    `select *
       from audit_logs
      where entity_id = $1::uuid
         or (entity = 'beneficiary' and entity_id = $1::uuid)
      order by created_at desc`,
    [beneficiaryId],
  )).rows.map(normalizeRow);

  return {
    beneficiary,
    household,
    consents,
    enrollments,
    attendance,
    forms,
    actionPlans,
    actionItems,
    evolutions,
    auditLogs,
  };
}

function normalizeRow(row: Record<string, any>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    if (value instanceof Date) {
      normalized[key] = value.toISOString();
    } else if (Array.isArray(value)) {
      normalized[key] = value.map((item) => (item instanceof Date ? item.toISOString() : item));
    } else if (value && typeof value === 'object') {
      normalized[key] = normalizeRow(value as Record<string, any>);
    } else {
      normalized[key] = value;
    }
  }

  return normalized;
}
