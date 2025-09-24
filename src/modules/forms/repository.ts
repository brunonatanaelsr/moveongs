import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { query, withTransaction } from '../../db';
import { AppError, NotFoundError } from '../../shared/errors';
import type {
  CreateSubmissionParams,
  CreateTemplateParams,
  FormAttachment,
  FormSubmissionRecord,
  FormSubmissionSummary,
  FormTemplateRecord,
  ListSubmissionsFilters,
  ListTemplatesFilters,
  SignatureEvidenceEntry,
  UpdateSubmissionParams,
  UpdateTemplateParams,
} from './types';

function mapTemplateRow(row: any): FormTemplateRecord {
  return {
    id: row.id,
    formType: row.form_type,
    schemaVersion: row.schema_version,
    schema: row.schema,
    status: row.status,
    publishedAt: row.published_at ? row.published_at.toISOString() : null,
  };
}

function toIsoString(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function mapTimestampArray(raw: unknown): string[] {
  if (!raw) {
    return [];
  }

  if (Array.isArray(raw)) {
    return raw
      .map((value) => toIsoString(value))
      .filter((value): value is string => Boolean(value));
  }

  return [];
}

function mapAttachments(raw: unknown): FormAttachment[] {
  if (!raw) {
    return [];
  }

  if (Array.isArray(raw)) {
    return raw as FormAttachment[];
  }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed as FormAttachment[];
      }
      if (parsed && typeof parsed === 'object') {
        return [parsed as FormAttachment];
      }
    } catch {
      return [];
    }
  }

  if (typeof raw === 'object') {
    return [raw as FormAttachment];
  }

  return [];
}

function mapSignatureEvidence(raw: unknown): SignatureEvidenceEntry[] {
  if (!raw) {
    return [];
  }

  if (Array.isArray(raw)) {
    return raw
      .map((item) => coerceSignatureEvidence(item))
      .filter((value): value is SignatureEvidenceEntry => Boolean(value));
  }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => coerceSignatureEvidence(item))
          .filter((value): value is SignatureEvidenceEntry => Boolean(value));
      }
      if (parsed && typeof parsed === 'object') {
        const value = coerceSignatureEvidence(parsed);
        return value ? [value] : [];
      }
    } catch {
      return [];
    }
  }

  if (raw && typeof raw === 'object') {
    const value = coerceSignatureEvidence(raw);
    return value ? [value] : [];
  }

  return [];
}

function coerceSignatureEvidence(value: unknown): SignatureEvidenceEntry | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const signer = typeof record.signer === 'string' ? record.signer : null;
  if (!signer) {
    return null;
  }

  const metadata = record.metadata;

  return {
    signer,
    capturedAt: toIsoString(record.capturedAt),
    method: typeof record.method === 'string' ? record.method : null,
    ipAddress: typeof record.ipAddress === 'string' ? record.ipAddress : null,
    userAgent: typeof record.userAgent === 'string' ? record.userAgent : null,
    payloadHash: typeof record.payloadHash === 'string' ? record.payloadHash : null,
    metadata:
      metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? (metadata as Record<string, unknown>)
        : null,
  };
}

function mapSubmissionSummaryRow(row: any): FormSubmissionSummary {
  return {
    id: row.id,
    beneficiaryId: row.beneficiary_id,
    beneficiaryName: row.beneficiary_name ?? null,
    formType: row.form_type,
    schemaVersion: row.schema_version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    createdBy: row.created_by ?? null,
  };
}

function ensurePayload(raw: any): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }

  return {};
}

function mapSubmissionRow(row: any): FormSubmissionRecord {
  return {
    ...mapSubmissionSummaryRow(row),
    payload: ensurePayload(row.payload),
    signedBy: Array.isArray(row.signed_by) ? (row.signed_by as string[]) : [],
    signedAt: mapTimestampArray(row.signed_at),
    attachments: mapAttachments(row.attachments),
    signatureEvidence: mapSignatureEvidence(row.signature_evidence),
    template: row.template_id
      ? {
          id: row.template_id,
          formType: row.template_form_type,
          schemaVersion: row.template_schema_version,
          schema: row.template_schema,
          status: row.template_status,
          publishedAt: row.template_published_at ? row.template_published_at.toISOString() : null,
        }
      : null,
  };
}

function buildScopeCondition(
  column: string,
  values: unknown[],
  scopes?: string[] | null,
): string | null {
  if (!scopes || scopes.length === 0) {
    return null;
  }

  const placeholders = scopes.map((scope) => {
    values.push(scope);
    return `$${values.length}`;
  });

  return `${column} in (${placeholders.join(', ')})`;
}

export async function listFormTemplates(filters: ListTemplatesFilters): Promise<FormTemplateRecord[]> {
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (filters.formType) {
    values.push(filters.formType);
    clauses.push(`form_type = $${values.length}`);
  }

  if (filters.status) {
    values.push(filters.status);
    clauses.push(`status = $${values.length}`);
  }

  const where = clauses.length > 0 ? `where ${clauses.join(' and ')}` : '';

  const { rows } = await query(
    `select * from form_templates
      ${where}
      order by form_type asc, schema_version desc`,
    values,
  );

  return rows.map(mapTemplateRow);
}

export async function getTemplateById(id: string): Promise<FormTemplateRecord | null> {
  const { rows } = await query('select * from form_templates where id = $1', [id]);
  if (rows.length === 0) {
    return null;
  }

  return mapTemplateRow(rows[0]);
}

export async function getTemplateByTypeAndVersion(formType: string, schemaVersion: string): Promise<FormTemplateRecord | null> {
  const { rows } = await query(
    `select * from form_templates
      where form_type = $1 and schema_version = $2
      limit 1`,
    [formType, schemaVersion],
  );

  if (rows.length === 0) {
    return null;
  }

  return mapTemplateRow(rows[0]);
}

export async function getLatestActiveTemplate(formType: string): Promise<FormTemplateRecord | null> {
  const { rows } = await query(
    `select * from form_templates
      where form_type = $1 and status = 'active'
      order by published_at desc nulls last, schema_version desc
      limit 1`,
    [formType],
  );

  if (rows.length === 0) {
    return null;
  }

  return mapTemplateRow(rows[0]);
}

export async function createFormTemplate(params: CreateTemplateParams): Promise<FormTemplateRecord> {
  return withTransaction(async (client) => {
    const existing = await client.query('select id from form_templates where form_type = $1 and schema_version = $2', [
      params.formType,
      params.schemaVersion,
    ]);

    if (existing.rowCount && existing.rowCount > 0) {
      throw new AppError('A template with this form type and schema version already exists', 409);
    }

    const status = params.status ?? 'active';

    const id = randomUUID();

    const { rows } = await client.query(
      `insert into form_templates (id, form_type, schema_version, schema, status, published_at)
       values ($1, $2, $3, $4, $5, case when $5 = 'active' then now() else null end)
       returning *`,
      [id, params.formType, params.schemaVersion, params.schema, status],
    );

    return mapTemplateRow(rows[0]);
  });
}

export async function updateFormTemplate(id: string, params: UpdateTemplateParams): Promise<FormTemplateRecord> {
  return withTransaction(async (client) => {
    const current = await client.query('select * from form_templates where id = $1', [id]);
    if (current.rowCount === 0) {
      throw new NotFoundError('Form template not found');
    }

    const row = current.rows[0];
    const schema = params.schema ?? row.schema;
    const status = params.status ?? row.status;
    const shouldUpdatePublishedAt = status === 'active' && row.status !== 'active';

    await client.query(
      `update form_templates set
         schema = $2,
         status = $3,
         published_at = case when $4 then now() else published_at end
       where id = $1`,
      [id, schema, status, shouldUpdatePublishedAt],
    );

    const refreshed = await client.query('select * from form_templates where id = $1', [id]);
    return mapTemplateRow(refreshed.rows[0]);
  });
}

export async function listSubmissionsByBeneficiary(filters: ListSubmissionsFilters): Promise<FormSubmissionSummary[]> {
  const values: unknown[] = [filters.beneficiaryId];
  const clauses: string[] = [];

  if (filters.formType) {
    values.push(filters.formType);
    clauses.push(`fs.form_type = $${values.length}`);
  }

  const scopeCondition = buildScopeCondition('c.project_id', values, filters.allowedProjectIds ?? null);
  if (scopeCondition) {
    clauses.push(`exists (
      select 1
        from enrollments e
        join cohorts c on c.id = e.cohort_id
       where e.beneficiary_id = fs.beneficiary_id
         and ${scopeCondition}
    )`);
  }

  const whereClause = clauses.length > 0 ? `and ${clauses.join(' and ')}` : '';

  values.push(filters.limit);
  values.push(filters.offset);

  const { rows } = await query(
    `select fs.id,
            fs.beneficiary_id,
            b.full_name as beneficiary_name,
            fs.form_type,
            fs.schema_version,
            fs.created_at,
            fs.updated_at,
            fs.created_by
       from form_submissions fs
       join beneficiaries b on b.id = fs.beneficiary_id
      where fs.beneficiary_id = $1
        ${whereClause}
      order by fs.created_at desc
      limit $${values.length - 1} offset $${values.length}`,
    values,
  );

  return rows.map(mapSubmissionSummaryRow);
}

export async function getFormSubmissionById(
  id: string,
  allowedProjectIds?: string[] | null,
): Promise<FormSubmissionRecord | null> {
  return getFormSubmissionByIdWithScope(id, allowedProjectIds);
}

async function getFormSubmissionByIdWithScope(
  id: string,
  allowedProjectIds?: string[] | null,
): Promise<FormSubmissionRecord | null> {
  const scopes = allowedProjectIds && allowedProjectIds.length > 0 ? allowedProjectIds : null;
  const values: unknown[] = [id];
  const scopeCondition = buildScopeCondition('c.project_id', values, scopes);
  const scopeClause = scopeCondition
    ? `and exists (
          select 1
            from enrollments e
            join cohorts c on c.id = e.cohort_id
           where e.beneficiary_id = fs.beneficiary_id
             and ${scopeCondition}
        )`
    : '';

  const { rows } = await query(
    `select fs.*, b.full_name as beneficiary_name,
            t.id as template_id,
            t.form_type as template_form_type,
            t.schema_version as template_schema_version,
            t.schema as template_schema,
            t.status as template_status,
            t.published_at as template_published_at
       from form_submissions fs
       join beneficiaries b on b.id = fs.beneficiary_id
       left join form_templates t on t.form_type = fs.form_type and t.schema_version = fs.schema_version
      where fs.id = $1
        ${scopeClause}`,
    values,
  );

  if (rows.length === 0) {
    return null;
  }

  return mapSubmissionRow(rows[0]);
}

function toDateArray(values?: string[] | null): (Date | null)[] | null {
  if (!values) {
    return null;
  }

  return values.map((value) => {
    if (!value) {
      return null;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date;
  });
}

export async function createFormSubmission(params: CreateSubmissionParams): Promise<FormSubmissionRecord> {
  return withTransaction(async (client) => {
    await ensureTemplateExists(client, params.formType, params.schemaVersion);

    const signedAt = toDateArray(params.signedAt ?? null);

    const id = randomUUID();

    const { rows } = await client.query(
      `insert into form_submissions (
         id,
         beneficiary_id,
         form_type,
         schema_version,
         payload,
         signed_by,
         signed_at,
         signature_evidence,
         attachments,
         created_by
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       returning id`,
      [
        id,
        params.beneficiaryId,
        params.formType,
        params.schemaVersion,
        params.payload,
        params.signedBy ?? null,
        signedAt,
        params.signatureEvidence ?? null,
        params.attachments ?? null,
        params.createdBy ?? null,
      ],
    );

    const submissionId = rows[0].id as string;
    const submission = await getFormSubmissionById(submissionId);

    if (!submission) {
      throw new AppError('Failed to load submission after creation', 500);
    }

    return submission;
  });
}

async function ensureTemplateExists(client: PoolClient, formType: string, schemaVersion: string) {
  const template = await client.query(
    `select status from form_templates
      where form_type = $1 and schema_version = $2`,
    [formType, schemaVersion],
  );

  if (template.rowCount === 0) {
    throw new AppError('Form template not found for provided type and version', 404);
  }

  const status = template.rows[0].status as string;
  if (status !== 'active') {
    throw new AppError('Form template is not active', 400);
  }
}

export async function updateFormSubmission(id: string, params: UpdateSubmissionParams): Promise<FormSubmissionRecord> {
  return withTransaction(async (client) => {
    const existing = await client.query('select id from form_submissions where id = $1', [id]);
    if (existing.rowCount === 0) {
      throw new NotFoundError('Form submission not found');
    }

    const updates: string[] = [];
    const values: unknown[] = [id];

    if (params.payload !== undefined) {
      values.push(params.payload ?? {});
      updates.push(`payload = $${values.length}`);
    }

    if (params.signedBy !== undefined) {
      values.push(params.signedBy);
      updates.push(`signed_by = $${values.length}`);
    }

    if (params.signedAt !== undefined) {
      values.push(toDateArray(params.signedAt));
      updates.push(`signed_at = $${values.length}`);
    }

    if (params.attachments !== undefined) {
      values.push(params.attachments);
      updates.push(`attachments = $${values.length}`);
    }

    if (params.signatureEvidence !== undefined) {
      values.push(params.signatureEvidence);
      updates.push(`signature_evidence = $${values.length}`);
    }

    if (updates.length > 0) {
      updates.push('updated_at = now()');
      await client.query(
        `update form_submissions
            set ${updates.join(', ')}
          where id = $1`,
        values,
      );
    }

    const submission = await getFormSubmissionById(id);
    if (!submission) {
      throw new AppError('Failed to load submission after update', 500);
    }

    return submission;
  });
}
