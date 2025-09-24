import { randomUUID } from 'node:crypto';
import { logger } from '../../../config/logger';
import type { NotificationEvent } from '../types';
import { BaseNotificationAdapter } from './base-adapter';
import { NotificationMetrics } from '../metrics';

export type EmailNotificationPayload = {
  recipients: string[];
  subject: string;
  body: string;
  eventType: NotificationEvent['type'];
  eventId: string;
};

export type EmailDispatchRecord = EmailNotificationPayload & {
  messageId: string;
  dispatchedAt: string;
};

export class EmailNotificationAdapter extends BaseNotificationAdapter<EmailNotificationPayload> {
  private readonly dispatchHistory: EmailDispatchRecord[] = [];

  constructor(
    metrics: NotificationMetrics,
    private readonly sender: string,
  ) {
    super('email', metrics);
  }

  async send(payload: EmailNotificationPayload): Promise<void> {
    await this.executeWithMetrics(async () => {
      const record: EmailDispatchRecord = {
        ...payload,
        messageId: randomUUID(),
        dispatchedAt: new Date().toISOString(),
      };

      this.dispatchHistory.push(record);
      logger.info({
        channel: 'email',
        from: this.sender,
        to: payload.recipients,
        subject: payload.subject,
        eventId: payload.eventId,
        eventType: payload.eventType,
        messageId: record.messageId,
      }, 'Email notification dispatched');
    });
  }

  getHistory(): ReadonlyArray<EmailDispatchRecord> {
    return this.dispatchHistory;
  }

  reset() {
    this.dispatchHistory.length = 0;
  }
}
