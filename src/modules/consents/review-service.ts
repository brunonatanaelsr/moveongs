import { getEnv } from '../../config/env';
import { recordAuditLog } from '../../shared/audit';
import { publishNotificationEvent } from '../notifications/service';
import {
  disableConsentReviewSchedule,
  getConsentReviewSchedule,
  listConsentReviewsDue,
  persistConsentReviewCompletion,
  markConsentReviewNotified,
  upsertConsentReviewSchedule,
} from './review.repository';

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function toDate(value: string | Date): Date {
  if (value instanceof Date) {
    return value;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid date value');
  }
  return parsed;
}

const env = getEnv();
const reviewIntervalDays = Number(env.CONSENT_REVIEW_INTERVAL_DAYS);
const notificationCooldownDays = Number(env.CONSENT_REVIEW_NOTIFICATION_COOLDOWN_DAYS);

export async function scheduleConsentReview(consentId: string, grantedAt: string | Date): Promise<void> {
  const granted = toDate(grantedAt);
  const nextReviewAt = addDays(granted, reviewIntervalDays);
  await upsertConsentReviewSchedule({
    consentId,
    lastReviewedAt: granted,
    nextReviewAt,
  });
}

export async function disableConsentReview(consentId: string): Promise<void> {
  await disableConsentReviewSchedule(consentId);
}

export type ConsentReviewDueNotification = {
  consentId: string;
  beneficiaryId: string;
  type: string;
  textVersion: string;
  dueAt: string;
};

export async function triggerConsentReviewNotifications(referenceDate = new Date()): Promise<ConsentReviewDueNotification[]> {
  const notifyBefore = addDays(referenceDate, -notificationCooldownDays);
  const due = await listConsentReviewsDue({ referenceDate, notifyBefore });
  const notifiedAt = new Date();

  for (const item of due) {
    publishNotificationEvent({
      type: 'consent.review.pending',
      data: {
        consentId: item.consentId,
        beneficiaryId: item.beneficiaryId,
        type: item.type,
        textVersion: item.textVersion,
        dueAt: item.nextReviewAt.toISOString(),
      },
    });
    await markConsentReviewNotified(item.consentId, notifiedAt);
  }

  return due.map((item) => ({
    consentId: item.consentId,
    beneficiaryId: item.beneficiaryId,
    type: item.type,
    textVersion: item.textVersion,
    dueAt: item.nextReviewAt.toISOString(),
  }));
}

export async function markConsentReviewCompleted(
  consentId: string,
  params: { reviewedAt?: string | Date; userId?: string | null },
): Promise<void> {
  const schedule = await getConsentReviewSchedule(consentId);
  const reviewedAt = toDate(params.reviewedAt ?? new Date());
  const nextReviewAt = addDays(reviewedAt, reviewIntervalDays);

  await persistConsentReviewCompletion(consentId, reviewedAt, nextReviewAt);

  await recordAuditLog({
    userId: params.userId ?? null,
    entity: 'consent_review',
    entityId: consentId,
    action: 'update',
    beforeData: schedule,
    afterData: {
      lastReviewedAt: reviewedAt.toISOString(),
      nextReviewAt: nextReviewAt.toISOString(),
    },
  });
}
