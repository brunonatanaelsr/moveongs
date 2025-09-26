import twilio, { Twilio } from 'twilio';
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

export type WhatsAppDispatchRecord = {
  number: string;
  message: string;
  eventType: NotificationEvent['type'];
  eventId: string;
  provider: 'twilio';
  providerMessageId: string;
  dispatchedAt: string;
  status: string | null;
};

export type WhatsAppNotificationAdapterConfig = {
  provider: 'twilio';
  accountSid: string;
  authToken: string;
  from: string;
  rateLimitPerSecond: number;
};

export class WhatsAppNotificationAdapter extends BaseNotificationAdapter<WhatsAppNotificationPayload> {
  private readonly dispatchHistory: WhatsAppDispatchRecord[] = [];

  private readonly client: Twilio;

  private readonly rateLimiter: RateLimiter;

  constructor(
    metrics: NotificationMetrics,
    private readonly config: WhatsAppNotificationAdapterConfig,
  ) {
    super('whatsapp', metrics);
    this.client = twilio(config.accountSid, config.authToken);
    this.rateLimiter = new RateLimiter(Math.max(0, config.rateLimitPerSecond));
  }

  async send(payload: WhatsAppNotificationPayload): Promise<WhatsAppDispatchRecord[]> {
    return this.executeWithMetrics(async () => {
      const records: WhatsAppDispatchRecord[] = [];

      for (const number of payload.numbers) {
        await this.rateLimiter.consume();
        const formattedNumber = this.formatNumber(number);

        try {
          const message = await this.client.messages.create({
            from: this.formatNumber(this.config.from),
            to: formattedNumber,
            body: payload.message,
          });

          const record: WhatsAppDispatchRecord = {
            number,
            message: payload.message,
            eventType: payload.eventType,
            eventId: payload.eventId,
            provider: 'twilio',
            providerMessageId: message.sid,
            dispatchedAt: new Date().toISOString(),
            status: message.status ?? null,
          };

          this.dispatchHistory.push(record);
          records.push(record);

          logger.info({
            channel: 'whatsapp',
            provider: 'twilio',
            to: number,
            eventId: payload.eventId,
            eventType: payload.eventType,
            messageSid: message.sid,
            status: message.status,
          }, 'WhatsApp notification dispatched');
        } catch (error) {
          this.handleProviderError(error, number, payload);
        }
      }

      return records;
    });
  }

  getHistory(): ReadonlyArray<WhatsAppDispatchRecord> {
    return this.dispatchHistory;
  }

  reset() {
    this.dispatchHistory.length = 0;
    this.rateLimiter.reset();
  }

  private handleProviderError(error: unknown, number: string, payload: WhatsAppNotificationPayload): never {
    const enrichedError = error instanceof Error ? error : new Error('Unknown WhatsApp dispatch error');
    const metadata: Record<string, unknown> = {};

    if (typeof error === 'object' && error !== null) {
      const maybeStatus = (error as any).status;
      const maybeCode = (error as any).code;
      const maybeMoreInfo = (error as any).moreInfo;
      if (maybeStatus) metadata.status = maybeStatus;
      if (maybeCode) metadata.code = maybeCode;
      if (maybeMoreInfo) metadata.moreInfo = maybeMoreInfo;
    }

    logger.error({
      channel: 'whatsapp',
      provider: 'twilio',
      to: number,
      eventId: payload.eventId,
      eventType: payload.eventType,
      ...metadata,
      error: enrichedError instanceof Error ? enrichedError.message : enrichedError,
    }, 'WhatsApp provider error');

    throw enrichedError;
  }

  private formatNumber(value: string): string {
    return value.startsWith('whatsapp:') ? value : `whatsapp:${value}`;
  }
}

class RateLimiter {
  private allowance: number;

  private lastRefill = Date.now();

  constructor(private readonly perSecond: number) {
    this.allowance = perSecond;
  }

  async consume() {
    if (this.perSecond <= 0) {
      return;
    }

    while (true) {
      this.refill();
      if (this.allowance >= 1) {
        this.allowance -= 1;
        return;
      }

      const waitTime = Math.max(1, 1000 - (Date.now() - this.lastRefill));
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  reset() {
    this.allowance = this.perSecond;
    this.lastRefill = Date.now();
  }

  private refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed >= 1000) {
      const cycles = Math.floor(elapsed / 1000);
      this.allowance = Math.min(this.perSecond, this.allowance + cycles * this.perSecond);
      this.lastRefill = now;
    }
  }
}
