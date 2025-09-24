import { getEnv } from '../../config/env';
import { recordAuditLog } from '../../shared/audit';
import { AppError } from '../../shared/errors';
import { publishNotificationEvent } from '../notifications/service';
import {
  collectBeneficiaryDataset,
  getDataSubjectRequestById,
  getDataSubjectRequestExport,
  insertDataSubjectRequest,
  insertDataSubjectRequestExport,
  listOpenDataSubjectRequests,
  updateDataSubjectRequestStatus,
  type DataSubjectRequestExportRecord,
  type DataSubjectRequestRecord,
} from './repository';

const env = getEnv();

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function requestDataSubjectExport(params: {
  beneficiaryId: string;
  requestedBy?: string | null;
}): Promise<{ request: DataSubjectRequestRecord; export: DataSubjectRequestExportRecord }> {
  const slaDays = Number.parseInt(env.DSR_SLA_DAYS, 10) || 15;
  const dueAt = new Date(Date.now() + slaDays * MS_PER_DAY);

  const request = await insertDataSubjectRequest({
    beneficiaryId: params.beneficiaryId,
    requestedBy: params.requestedBy ?? null,
    requestType: 'export',
    dueAt,
    metadata: { initiatedAt: new Date().toISOString(), initiatedBy: params.requestedBy ?? null },
  });

  publishNotificationEvent({
    type: 'privacy.dsr_created',
    data: {
      requestId: request.id,
      beneficiaryId: request.beneficiaryId,
      dueAt: request.dueAt,
    },
  });

  const payload = await collectBeneficiaryDataset(params.beneficiaryId);
  const exportRecord = await insertDataSubjectRequestExport({ requestId: request.id, payload });
  const completed = await updateDataSubjectRequestStatus({
    requestId: request.id,
    status: 'completed',
    completedAt: new Date(),
    metadata: {
      ...(request.metadata ?? {}),
      exportGeneratedAt: exportRecord.exportedAt,
      exportSizeBytes: Buffer.byteLength(JSON.stringify(payload), 'utf8'),
    },
  });

  await recordAuditLog({
    userId: params.requestedBy ?? null,
    entity: 'data_subject_request',
    entityId: request.id,
    action: 'dsr_export_generated',
    afterData: { request: completed },
  });

  publishNotificationEvent({
    type: 'privacy.dsr_completed',
    data: {
      requestId: completed.id,
      beneficiaryId: completed.beneficiaryId,
      completedAt: completed.completedAt!,
      slaBreached: completed.slaBreached,
    },
  });

  return { request: completed, export: exportRecord };
}

export async function getDataSubjectRequestDetails(id: string): Promise<{
  request: DataSubjectRequestRecord;
  export?: DataSubjectRequestExportRecord | null;
}> {
  const request = await getDataSubjectRequestById(id);
  if (!request) {
    throw new AppError('Data subject request not found', 404);
  }

  const exportRecord = await getDataSubjectRequestExport(id);
  return { request, export: exportRecord };
}

export async function runDataSubjectRequestSlaScan(now: Date = new Date()): Promise<{ breached: string[]; dueSoon: string[] }> {
  const requests = await listOpenDataSubjectRequests();
  const breached: string[] = [];
  const dueSoon: string[] = [];

  for (const request of requests) {
    const dueAt = new Date(request.dueAt);
    const timeRemaining = dueAt.getTime() - now.getTime();
    const metadata = (request.metadata ?? {}) as Record<string, unknown>;
    const dueSoonThresholdMs = 2 * MS_PER_DAY;

    if (timeRemaining <= 0) {
      const alreadyNotified = typeof metadata.breachNotifiedAt === 'string';
      if (!request.slaBreached || !alreadyNotified) {
        await updateDataSubjectRequestStatus({
          requestId: request.id,
          status: request.status,
          slaBreached: true,
          metadata: { ...metadata, breachNotifiedAt: now.toISOString() },
        });
        publishNotificationEvent({
          type: 'privacy.dsr_sla_breached',
          data: {
            requestId: request.id,
            beneficiaryId: request.beneficiaryId,
            dueAt: request.dueAt,
          },
        });
        breached.push(request.id);
      }
      continue;
    }

    if (timeRemaining <= dueSoonThresholdMs) {
      const alreadyNotified = typeof metadata.dueSoonNotifiedAt === 'string';
      if (!alreadyNotified) {
        await updateDataSubjectRequestStatus({
          requestId: request.id,
          status: request.status,
          metadata: { ...metadata, dueSoonNotifiedAt: now.toISOString() },
        });
        publishNotificationEvent({
          type: 'privacy.dsr_due_soon',
          data: {
            requestId: request.id,
            beneficiaryId: request.beneficiaryId,
            dueAt: request.dueAt,
          },
        });
        dueSoon.push(request.id);
      }
    }
  }

  return { breached, dueSoon };
}
