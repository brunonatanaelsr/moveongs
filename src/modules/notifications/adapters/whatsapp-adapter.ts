import { randomUUID } from 'node:crypto';
import { logger } from '../../../config/logger';
import type { NotificationEvent } from '../types';
import { BaseNotificationAdapter } from './base-adapter';
import { NotificationMetrics } from '../metrics';

export type WhatsAppNotificationPayload = {
  numbers: string[];
  message: string;
  eventType: NotificationEvent['type'];
  eventId: string;
};

export type WhatsAppDispatchRecord = WhatsAppNotificationPayload & {
  messageId: string;
  dispatchedAt: string;
};

export class WhatsAppNotificationAdapter extends BaseNotificationAdapter<WhatsAppNotificationPayload> {
  private readonly dispatchHistory: WhatsAppDispatchRecord[] = [];

  constructor(metrics: NotificationMetrics) {
    super('whatsapp', metrics);
  }

  async send(payload: WhatsAppNotificationPayload): Promise<void> {
    await this.executeWithMetrics(async () => {
      const record: WhatsAppDispatchRecord = {
        ...payload,
        messageId: randomUUID(),
        dispatchedAt: new Date().toISOString(),
      };

      this.dispatchHistory.push(record);
      logger.info({
        channel: 'whatsapp',
        to: payload.numbers,
        eventId: payload.eventId,
        eventType: payload.eventType,
        messageId: record.messageId,
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
