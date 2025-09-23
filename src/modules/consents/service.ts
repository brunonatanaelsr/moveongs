import { recordAuditLog } from '../../shared/audit';
import { AppError } from '../../shared/errors';
import {
  ConsentRecord,
  createConsent,
  getConsentById,
  listConsentsByBeneficiary,
  updateConsent,
} from './repository';
import { publishNotificationEvent } from '../notifications/service';

export async function listConsents(params: {
  beneficiaryId: string;
  type?: string;
  includeRevoked?: boolean;
}): Promise<ConsentRecord[]> {
  return listConsentsByBeneficiary(params);
}

export async function registerConsent(params: {
  beneficiaryId: string;
  type: string;
  textVersion: string;
  granted?: boolean;
  grantedAt?: string;
  evidence?: Record<string, unknown> | null;
  userId?: string | null;
}): Promise<ConsentRecord> {
  const granted = params.granted ?? true;
  const grantedAt = params.grantedAt ? new Date(params.grantedAt) : new Date();

  if (Number.isNaN(grantedAt.getTime())) {
    throw new AppError('Invalid grantedAt date', 400);
  }

  const consent = await createConsent({
    beneficiaryId: params.beneficiaryId,
    type: params.type,
    textVersion: params.textVersion,
    granted,
    grantedAt,
    evidence: params.evidence,
    createdBy: params.userId ?? null,
  });

  await recordAuditLog({
    userId: params.userId ?? null,
    entity: 'consent',
    entityId: consent.id,
    action: 'create',
    beforeData: null,
    afterData: consent,
  });

  publishNotificationEvent({
    type: 'consent.recorded',
    data: {
      consentId: consent.id,
      beneficiaryId: consent.beneficiaryId,
      type: consent.type,
      textVersion: consent.textVersion,
      granted: consent.granted,
      grantedAt: consent.grantedAt,
      revokedAt: consent.revokedAt,
    },
  });

  return consent;
}

export async function updateExistingConsent(id: string, params: {
  textVersion?: string;
  granted?: boolean;
  grantedAt?: string;
  revokedAt?: string;
  evidence?: Record<string, unknown> | null;
  userId?: string | null;
}): Promise<ConsentRecord> {
  const before = await getConsentById(id);
  if (!before) {
    throw new AppError('Consent not found', 404);
  }

  const grantedAt = params.grantedAt ? new Date(params.grantedAt) : undefined;
  const revokedAt = params.revokedAt ? new Date(params.revokedAt) : undefined;

  if (grantedAt && Number.isNaN(grantedAt.getTime())) {
    throw new AppError('Invalid grantedAt', 400);
  }

  if (revokedAt && Number.isNaN(revokedAt.getTime())) {
    throw new AppError('Invalid revokedAt', 400);
  }

  const updatePayload: {
    textVersion?: string;
    granted?: boolean;
    grantedAt?: Date | null;
    revokedAt?: Date | null;
    evidence?: Record<string, unknown> | null;
  } = {};

  if (params.textVersion !== undefined) {
    updatePayload.textVersion = params.textVersion;
  }

  if (params.granted !== undefined) {
    updatePayload.granted = params.granted;
  }

  if (grantedAt !== undefined) {
    updatePayload.grantedAt = grantedAt;
  }

  if (revokedAt !== undefined) {
    updatePayload.revokedAt = revokedAt;
  }

  if (params.evidence !== undefined) {
    updatePayload.evidence = params.evidence ?? null;
  }

  const updated = await updateConsent(id, updatePayload);

  await recordAuditLog({
    userId: params.userId ?? null,
    entity: 'consent',
    entityId: id,
    action: 'update',
    beforeData: before,
    afterData: updated,
  });

  publishNotificationEvent({
    type: 'consent.updated',
    data: {
      consentId: updated.id,
      beneficiaryId: updated.beneficiaryId,
      type: updated.type,
      textVersion: updated.textVersion,
      granted: updated.granted,
      grantedAt: updated.grantedAt,
      revokedAt: updated.revokedAt,
    },
  });

  return updated;
}

export async function getConsentOrFail(id: string): Promise<ConsentRecord> {
  const consent = await getConsentById(id);
  if (!consent) {
    throw new AppError('Consent not found', 404);
  }

  return consent;
}
