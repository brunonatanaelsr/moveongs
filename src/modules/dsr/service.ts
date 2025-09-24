import { AppError } from '../../shared/errors';
import { recordAuditLog } from '../../shared/audit';
import {
  fetchAttachmentsMetadata,
  fetchBeneficiaryProfile,
  fetchConsentsForBeneficiary,
  fetchEnrollments,
  fetchFormSubmissions,
  fetchHouseholdMembers,
  fetchVulnerabilities,
  fetchActionPlans,
  fetchEvolutions,
  fetchAuditLogsForBeneficiary,
  insertDsrRequest,
} from './repository';

export type DsrExportPayload = {
  beneficiary: Record<string, unknown>;
  householdMembers: unknown[];
  vulnerabilities: unknown[];
  consents: unknown[];
  enrollments: unknown[];
  formSubmissions: unknown[];
  actionPlans: unknown[];
  evolutions: unknown[];
  attachments: unknown[];
  auditTrail: unknown[];
};

export async function exportBeneficiaryData(beneficiaryId: string, requestedBy?: string | null) {
  const beneficiary = await fetchBeneficiaryProfile(beneficiaryId);
  if (!beneficiary) {
    throw new AppError('Beneficiary not found', 404);
  }

  const payload: DsrExportPayload = {
    beneficiary,
    householdMembers: await fetchHouseholdMembers(beneficiaryId),
    vulnerabilities: await fetchVulnerabilities(beneficiaryId),
    consents: await fetchConsentsForBeneficiary(beneficiaryId),
    enrollments: await fetchEnrollments(beneficiaryId),
    formSubmissions: await fetchFormSubmissions(beneficiaryId),
    actionPlans: await fetchActionPlans(beneficiaryId),
    evolutions: await fetchEvolutions(beneficiaryId),
    attachments: await fetchAttachmentsMetadata(beneficiaryId),
    auditTrail: await fetchAuditLogsForBeneficiary(beneficiaryId),
  };

  const record = await insertDsrRequest({
    beneficiaryId,
    requestedBy,
    payload,
  });

  await recordAuditLog({
    userId: requestedBy ?? null,
    entity: 'dsr_request',
    entityId: record.id,
    action: 'create',
    beforeData: null,
    afterData: {
      beneficiaryId,
      generatedAt: record.fulfilledAt.toISOString(),
    },
  });

  return {
    requestId: record.id,
    generatedAt: record.fulfilledAt.toISOString(),
    data: payload,
  };
}
