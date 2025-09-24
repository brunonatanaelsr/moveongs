import { createHmac } from 'node:crypto';
import { logger } from '../../../config/logger';
import type { NotificationEvent } from '../types';
import type { WebhookSubscription } from '../webhook-registry';
import { BaseNotificationAdapter } from './base-adapter';
import { NotificationMetrics } from '../metrics';

export type WebhookJobPayload = {
  subscription: WebhookSubscription;
  event: NotificationEvent & { triggeredAt: string; id: string };
  timeoutMs: number;
  defaultSecret: string | null;
};

export class WebhookNotificationAdapter extends BaseNotificationAdapter<WebhookJobPayload> {
  private readonly deliveredKeys = new Set<string>();

  constructor(metrics: NotificationMetrics) {
    super('webhook', metrics);
  }

  async send(payload: WebhookJobPayload): Promise<void> {
    const fetchFn: typeof fetch | undefined = (globalThis as any).fetch;
    if (!fetchFn) {
      throw new Error('Fetch API not available for webhook dispatch');
    }

    const deliveryKey = this.buildDeliveryKey(payload.subscription.id, payload.event.id);
    if (this.deliveredKeys.has(deliveryKey)) {
      logger.info({
        channel: 'webhook',
        eventId: payload.event.id,
        webhookId: payload.subscription.id,
      }, 'Skipping webhook dispatch because it was already delivered');
      return;
    }

    await this.executeWithMetrics(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), payload.timeoutMs);

      try {
        const requestBody = JSON.stringify({
          id: payload.event.id,
          event: payload.event.type,
          triggeredAt: payload.event.triggeredAt,
          data: payload.event.data,
        });

        const timestamp = new Date().toISOString();
        const deliveryId = deliveryKey;
        const headers: Record<string, string> = {
          'content-type': 'application/json',
          'x-imm-event': payload.event.type,
          'x-imm-webhook-id': payload.subscription.id,
          'x-imm-webhook-delivery': deliveryId,
          'x-imm-webhook-timestamp': timestamp,
        };

        const secret = payload.subscription.secret ?? payload.defaultSecret;
        if (secret) {
          headers['x-imm-webhook-signature'] = this.signPayload(secret, timestamp, requestBody);
        }

        const response = await fetchFn(payload.subscription.url, {
          method: 'POST',
          headers,
          body: requestBody,
          signal: controller.signal,
        });

        if (!response || typeof response.ok !== 'boolean') {
          throw new Error('Webhook dispatch returned an invalid response');
        }

        if (!response.ok) {
          const status = typeof response.status === 'number' ? response.status : 'unknown';
          throw new Error(`Webhook dispatch failed with status ${status}`);
        }

        this.deliveredKeys.add(deliveryKey);
        logger.info({
          channel: 'webhook',
          eventId: payload.event.id,
          webhookId: payload.subscription.id,
          url: payload.subscription.url,
        }, 'Webhook notification dispatched');
      } finally {
        clearTimeout(timeout);
      }
    });
  }

  reset() {
    this.deliveredKeys.clear();
  }

  private buildDeliveryKey(subscriptionId: string, eventId: string): string {
    return `${subscriptionId}:${eventId}`;
  }

  private signPayload(secret: string, timestamp: string, body: string): string {
    const hmac = createHmac('sha256', secret);
    hmac.update(`${timestamp}.${body}`);
    return `sha256=${hmac.digest('hex')}`;
  }
}
