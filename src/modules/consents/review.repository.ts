import { query } from '../../db';

export type ConsentReviewScheduleRecord = {
  consentId: string;
  lastReviewedAt: Date | null;
  nextReviewAt: Date;
  lastNotifiedAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ConsentReviewDueRecord = {
  consentId: string;
  beneficiaryId: string;
  type: string;
  textVersion: string;
  nextReviewAt: Date;
  lastNotifiedAt: Date | null;
};

export async function upsertConsentReviewSchedule(params: {
  consentId: string;
  lastReviewedAt: Date;
  nextReviewAt: Date;
}): Promise<void> {
  await query(
    `insert into consent_review_schedules (consent_id, last_reviewed_at, next_review_at, is_active, last_notified_at)
     values ($1, $2, $3, true, null)
     on conflict (consent_id)
     do update set
       last_reviewed_at = excluded.last_reviewed_at,
       next_review_at = excluded.next_review_at,
       is_active = true,
       last_notified_at = null,
       updated_at = now()`,
    [params.consentId, params.lastReviewedAt, params.nextReviewAt],
  );
}

export async function disableConsentReviewSchedule(consentId: string): Promise<void> {
  await query(
    `update consent_review_schedules
        set is_active = false,
            updated_at = now()
      where consent_id = $1`,
    [consentId],
  );
}

export async function markConsentReviewNotified(consentId: string, notifiedAt: Date): Promise<void> {
  await query(
    `update consent_review_schedules
        set last_notified_at = $2,
            updated_at = now()
      where consent_id = $1`,
    [consentId, notifiedAt],
  );
}

export async function persistConsentReviewCompletion(
  consentId: string,
  reviewedAt: Date,
  nextReviewAt: Date,
): Promise<void> {
  await query(
    `update consent_review_schedules
        set last_reviewed_at = $2,
            next_review_at = $3,
            last_notified_at = null,
            is_active = true,
            updated_at = now()
      where consent_id = $1`,
    [consentId, reviewedAt, nextReviewAt],
  );
}

export async function getConsentReviewSchedule(consentId: string): Promise<ConsentReviewScheduleRecord | null> {
  const { rows } = await query(
    `select consent_id, last_reviewed_at, next_review_at, last_notified_at, is_active, created_at, updated_at
       from consent_review_schedules
      where consent_id = $1`,
    [consentId],
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    consentId: row.consent_id,
    lastReviewedAt: row.last_reviewed_at,
    nextReviewAt: row.next_review_at,
    lastNotifiedAt: row.last_notified_at,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listConsentReviewsDue(params: {
  referenceDate: Date;
  notifyBefore: Date;
}): Promise<ConsentReviewDueRecord[]> {
  const { rows } = await query(
    `select c.id as consent_id,
            c.beneficiary_id,
            c.type,
            c.text_version,
            sched.next_review_at,
            sched.last_notified_at
       from consent_review_schedules sched
       join consents c on c.id = sched.consent_id
      where sched.is_active = true
        and c.granted = true
        and c.revoked_at is null
        and sched.next_review_at <= $1
        and (sched.last_notified_at is null or sched.last_notified_at <= $2)`,
    [params.referenceDate, params.notifyBefore],
  );

  return rows.map((row) => ({
    consentId: row.consent_id,
    beneficiaryId: row.beneficiary_id,
    type: row.type,
    textVersion: row.text_version,
    nextReviewAt: row.next_review_at,
    lastNotifiedAt: row.last_notified_at,
  }));
}
