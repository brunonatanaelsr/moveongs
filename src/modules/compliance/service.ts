import { logger } from '../../config/logger';
import { runConsentReviewAutomation } from '../consents/service';
import { runDataSubjectRequestSlaScan } from '../privacy/service';

let complianceInterval: NodeJS.Timeout | null = null;

export async function runComplianceCycle(now: Date = new Date()): Promise<void> {
  const reviewResult = await runConsentReviewAutomation(now);
  if (reviewResult.created.length > 0 || reviewResult.notified.length > 0) {
    logger.info({
      createdTasks: reviewResult.created,
      notifiedTasks: reviewResult.notified,
    }, 'Consent review automation cycle');
  }

  const dsrResult = await runDataSubjectRequestSlaScan(now);
  if (dsrResult.breached.length > 0 || dsrResult.dueSoon.length > 0) {
    logger.warn({
      breachedRequests: dsrResult.breached,
      dueSoonRequests: dsrResult.dueSoon,
    }, 'DSR SLA monitor cycle');
  }
}

export function startComplianceJobs(options?: { intervalMs?: number }): void {
  const intervalMs = options?.intervalMs && options.intervalMs > 0 ? options.intervalMs : 6 * 60 * 60 * 1000;

  if (complianceInterval) {
    clearInterval(complianceInterval);
  }

  const execute = async () => {
    try {
      await runComplianceCycle();
    } catch (error) {
      logger.error({ err: error }, 'Compliance cycle failed');
    }
  };

  void execute();
  complianceInterval = setInterval(() => {
    void execute();
  }, intervalMs);
}

export function stopComplianceJobs(): void {
  if (complianceInterval) {
    clearInterval(complianceInterval);
    complianceInterval = null;
  }
}
