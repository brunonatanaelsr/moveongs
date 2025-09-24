import { withTransaction, query } from '../../db';
import { AppError, NotFoundError } from '../../shared/errors';

export type ConsentRecord = {
  id: string;
  beneficiaryId: string;
  type: string;
  textVersion: string;
  granted: boolean;
  grantedAt: string;
  revokedAt: string | null;
  evidence: Record<string, unknown> | null;
  createdBy: string | null;
  createdAt: string;
};

function toIso(value: any): string {
  if (!value) {
    throw new AppError('Invalid timestamp value');
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError('Invalid timestamp value');
  }

  return date.toISOString();
}

function mapConsent(row: any): ConsentRecord {
  return {
    id: row.id,
    beneficiaryId: row.beneficiary_id,
    type: row.type,
    textVersion: row.text_version,
    granted: row.granted,
    grantedAt: toIso(row.granted_at),
    revokedAt: row.revoked_at ? toIso(row.revoked_at) : null,
    evidence: row.evidence ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ? toIso(row.created_at) : toIso(row.granted_at),
  };
}

export async function listConsentsByBeneficiary(params: {
  beneficiaryId: string;
  type?: string;
  includeRevoked?: boolean;
}): Promise<ConsentRecord[]> {
  const values: unknown[] = [params.beneficiaryId];
  const whereParts: string[] = ['c.beneficiary_id = $1'];

  if (params.type) {
    values.push(params.type);
    whereParts.push(`c.type = $${values.length}`);
  }

  if (!params.includeRevoked) {
    whereParts.push('c.revoked_at is null');
  }

  const { rows } = await query(
    `select c.*
       from consents c
      where ${whereParts.join(' and ')}
      order by c.granted_at desc nulls last, c.id desc`,
    values,
  );

  return rows.map(mapConsent);
}

export async function getConsentById(id: string): Promise<ConsentRecord | null> {
  const { rows } = await query('select * from consents where id = $1', [id]);
  if (rows.length === 0) {
    return null;
  }

  return mapConsent(rows[0]);
}

export async function createConsent(params: {
  beneficiaryId: string;
  type: string;
  textVersion: string;
  granted: boolean;
  grantedAt: Date;
  evidence?: Record<string, unknown> | null;
  createdBy?: string | null;
}): Promise<ConsentRecord> {
  return withTransaction(async (client) => {
    const beneficiary = await client.query('select id from beneficiaries where id = $1', [params.beneficiaryId]);
    if (beneficiary.rowCount === 0) {
      throw new AppError('Beneficiary not found', 404);
    }

    const { rows } = await client.query(
      `insert into consents (
         beneficiary_id,
         type,
         text_version,
         granted,
         granted_at,
         revoked_at,
         evidence,
         created_by
       ) values ($1,$2,$3,$4,$5,null,$6,$7)
       returning *`,
      [
        params.beneficiaryId,
        params.type,
        params.textVersion,
        params.granted,
        params.grantedAt,
        params.evidence ?? null,
        params.createdBy ?? null,
      ],
    );
    return mapConsent(rows[0]);
  });
}

export async function updateConsent(id: string, params: {
  textVersion?: string;
  granted?: boolean;
  grantedAt?: Date | null;
  revokedAt?: Date | null;
  evidence?: Record<string, unknown> | null;
}): Promise<ConsentRecord> {
  return withTransaction(async (client) => {
    const existing = await client.query('select * from consents where id = $1', [id]);
    if (existing.rowCount === 0) {
      throw new NotFoundError('Consent not found');
    }

    const row = existing.rows[0];

    const granted = params.granted ?? row.granted;
    let grantedAt: Date | null = params.grantedAt !== undefined ? params.grantedAt : row.granted_at;
    let revokedAt: Date | null = params.revokedAt !== undefined ? params.revokedAt : row.revoked_at;

    if (params.granted !== undefined) {
      if (params.granted) {
        grantedAt = params.grantedAt ?? new Date();
        revokedAt = null;
      } else {
        grantedAt = row.granted_at;
        revokedAt = params.revokedAt ?? new Date();
      }
    }

    const textVersion = params.textVersion ?? row.text_version;
    const evidence = params.evidence === undefined ? row.evidence : params.evidence;

    await client.query(
      `update consents set
         text_version = $2,
         granted = $3,
         granted_at = $4,
         revoked_at = $5,
         evidence = $6
       where id = $1`,
      [
        id,
        textVersion,
        granted,
        grantedAt,
        revokedAt,
        evidence ?? null,
      ],
    );

    const refreshed = await client.query('select * from consents where id = $1', [id]);
    return mapConsent(refreshed.rows[0]);
  });
}

export type ConsentReviewTaskRecord = {
  id: string;
  consentId: string;
  beneficiaryId: string;
  dueAt: string;
  status: string;
  lastNotifiedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

const REVIEW_INTERVAL_MS = 365 * 24 * 60 * 60 * 1000;

export async function listConsentsNeedingReview(now: Date): Promise<Array<{ consentId: string; beneficiaryId: string; dueAt: Date }>> {
  const { rows } = await query(
    `select c.id as consent_id,
            c.beneficiary_id,
            c.granted_at,
            coalesce((select max(cr.completed_at) from consent_review_queue cr where cr.consent_id = c.id), c.granted_at) as last_reviewed_at
       from consents c
       left join consent_review_queue pending
         on pending.consent_id = c.id
        and pending.status = 'pending'
      where c.granted = true
        and c.revoked_at is null
        and pending.id is null`,
    [],
  );

  const candidates: Array<{ consentId: string; beneficiaryId: string; dueAt: Date }> = [];

  for (const row of rows) {
    const reference = row.last_reviewed_at instanceof Date
      ? row.last_reviewed_at
      : new Date(row.last_reviewed_at ?? row.granted_at);
    if (Number.isNaN(reference.getTime())) {
      continue;
    }

    const dueAt = new Date(reference.getTime() + REVIEW_INTERVAL_MS);
    if (dueAt.getTime() <= now.getTime()) {
      candidates.push({
        consentId: row.consent_id,
        beneficiaryId: row.beneficiary_id,
        dueAt,
      });
    }
  }

  return candidates;
}

export async function insertConsentReviewTask(params: {
  consentId: string;
  beneficiaryId: string;
  dueAt: Date;
}): Promise<ConsentReviewTaskRecord> {
  const { rows } = await query(
    `insert into consent_review_queue (consent_id, beneficiary_id, due_at)
     values ($1, $2, $3)
     returning *`,
    [params.consentId, params.beneficiaryId, params.dueAt],
  );

  return mapReviewTask(rows[0]);
}

export async function listPendingConsentReviewTasks(): Promise<ConsentReviewTaskRecord[]> {
  const { rows } = await query(
    `select *
       from consent_review_queue
      where status = 'pending'
      order by due_at asc`,
    [],
  );

  return rows.map(mapReviewTask);
}

export async function markConsentReviewTaskNotified(taskId: string): Promise<void> {
  await query(
    `update consent_review_queue
        set last_notified_at = now()
      where id = $1`,
    [taskId],
  );
}

export async function markConsentReviewTaskCompleted(taskId: string): Promise<ConsentReviewTaskRecord> {
  const { rows } = await query(
    `update consent_review_queue
        set status = 'completed',
            completed_at = now()
      where id = $1
      returning *`,
    [taskId],
  );

  if (rows.length === 0) {
    throw new AppError('Review task not found', 404);
  }

  return mapReviewTask(rows[0]);
}

function mapReviewTask(row: any): ConsentReviewTaskRecord {
  return {
    id: row.id,
    consentId: row.consent_id,
    beneficiaryId: row.beneficiary_id,
    dueAt: row.due_at instanceof Date ? row.due_at.toISOString() : new Date(row.due_at).toISOString(),
    status: row.status,
    lastNotifiedAt: row.last_notified_at ? row.last_notified_at.toISOString() : null,
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    createdAt: row.created_at ? row.created_at.toISOString() : new Date().toISOString(),
  };
}
