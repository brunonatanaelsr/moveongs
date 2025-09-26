import { randomUUID } from 'node:crypto';
import { SendEmailCommand, type SendEmailCommandOutput } from '@aws-sdk/client-ses';
import { logger } from '../../../config/logger';
import type { NotificationEvent } from '../types';
import { BaseNotificationAdapter } from './base-adapter';
import { NotificationMetrics } from '../metrics';

type SesClient = {
  send(command: SendEmailCommand): Promise<SendEmailCommandOutput>;
};

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
    private readonly client: SesClient,
  ) {
    super('email', metrics);
  }

  async send(payload: EmailNotificationPayload): Promise<void> {
    await this.executeWithMetrics(async () => {
      const command = new SendEmailCommand({
        Source: this.sender,
        Destination: {
          ToAddresses: payload.recipients,
        },
        Message: {
          Subject: {
            Data: payload.subject,
            Charset: 'UTF-8',
          },
          Body: {
            Text: {
              Data: payload.body,
              Charset: 'UTF-8',
            },
          },
        },
      });

      let response: SendEmailCommandOutput;

      try {
        response = await this.client.send(command);
      } catch (error) {
        logger.error({
          channel: 'email',
          from: this.sender,
          to: payload.recipients,
          subject: payload.subject,
          eventId: payload.eventId,
          eventType: payload.eventType,
          error,
        }, 'Email notification dispatch failed');
        throw error;
      }

      const messageId = response.MessageId ?? randomUUID();
      const record: EmailDispatchRecord = {
        ...payload,
        messageId,
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
        messageId,
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
