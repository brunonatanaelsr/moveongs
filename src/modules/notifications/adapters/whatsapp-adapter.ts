import { randomUUID } from 'node:crypto';
import { logger } from '../../../config/logger';
import type { NotificationEvent } from '../types';
import { BaseNotificationAdapter } from './base-adapter';
import { NotificationMetrics } from '../metrics';

type TwilioMessageCreateParams = {
  from: string;
  to: string;
  body: string;
};

type TwilioMessageInstance = {
  sid: string;
  status?: string;
  to?: string;
};

type TwilioMessagesClient = {
  create(params: TwilioMessageCreateParams): Promise<TwilioMessageInstance>;
};

type TwilioClient = {
  messages: TwilioMessagesClient;
};

export type WhatsAppNotificationPayload = {
  numbers: string[];
  message: string;
  eventType: NotificationEvent['type'];
  eventId: string;
};

export type WhatsAppDispatchRecord = WhatsAppNotificationPayload & {
  messageId: string;
  dispatchedAt: string;
  deliveries: Array<{
    number: string;
    sid: string;
    status: string;
  }>;
};

export class WhatsAppNotificationAdapter extends BaseNotificationAdapter<WhatsAppNotificationPayload> {
  private readonly dispatchHistory: WhatsAppDispatchRecord[] = [];

  constructor(
    metrics: NotificationMetrics,
    private readonly sender: string,
    private readonly client: TwilioClient,
  ) {
    super('whatsapp', metrics);
  }

  async send(payload: WhatsAppNotificationPayload): Promise<void> {
    await this.executeWithMetrics(async () => {
      const deliveries: WhatsAppDispatchRecord['deliveries'] = [];

      try {
        for (const number of payload.numbers) {
          const to = number.startsWith('whatsapp:') ? number : `whatsapp:${number}`;
          const response = await this.client.messages.create({
            from: this.sender,
            to,
            body: payload.message,
          });

          deliveries.push({
            number: to,
            sid: response.sid,
            status: response.status ?? 'unknown',
          });
        }
      } catch (error) {
        logger.error({
          channel: 'whatsapp',
          from: this.sender,
          to: payload.numbers,
          eventId: payload.eventId,
          eventType: payload.eventType,
          error,
        }, 'WhatsApp notification dispatch failed');
        throw error;
      }

      const record: WhatsAppDispatchRecord = {
        ...payload,
        messageId: randomUUID(),
        dispatchedAt: new Date().toISOString(),
        deliveries,
      };

      this.dispatchHistory.push(record);
      logger.info({
        channel: 'whatsapp',
        from: this.sender,
        to: payload.numbers,
        eventId: payload.eventId,
        eventType: payload.eventType,
        messageId: record.messageId,
        providerMessageIds: deliveries.map((delivery) => delivery.sid),
      }, 'WhatsApp notification dispatched');
    });
  }

  getHistory(): ReadonlyArray<WhatsAppDispatchRecord> {
    return this.dispatchHistory;
  }

  reset() {
    this.dispatchHistory.length = 0;
  }
}
