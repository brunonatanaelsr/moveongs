import sgMail, { type ClientResponse, type MailDataRequired, type ResponseError } from '@sendgrid/mail';
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
  provider: 'sendgrid';
  providerMessageId: string | null;
  dispatchedAt: string;
  status: 'accepted' | 'sent';
  providerResponse: {
    statusCode: number;
    headers: Record<string, string>;
    requestId?: string;
  };
};

export type EmailNotificationAdapterConfig = {
  provider: 'sendgrid';
  apiKey: string;
  sender: string;
  categories?: string[];
};

export class EmailNotificationAdapter extends BaseNotificationAdapter<EmailNotificationPayload> {
  private readonly dispatchHistory: EmailDispatchRecord[] = [];

  constructor(
    metrics: NotificationMetrics,
    private readonly config: EmailNotificationAdapterConfig,
  ) {
    super('email', metrics);
    sgMail.setApiKey(config.apiKey);
  }

  async send(payload: EmailNotificationPayload): Promise<EmailDispatchRecord> {
    return this.executeWithMetrics(async () => {
      const [response] = await this.dispatchWithProvider(payload);

      const dispatchedAt = new Date().toISOString();
      const headers = this.normalizeHeaders(response.headers ?? {});
      const providerMessageId = this.getHeaderValue(headers, 'x-message-id') ?? null;
      const requestId = this.getHeaderValue(headers, 'x-request-id');

      const record: EmailDispatchRecord = {
        ...payload,
        provider: 'sendgrid',
        providerMessageId,
        dispatchedAt,
        status: response.statusCode === 202 ? 'accepted' : 'sent',
        providerResponse: {
          statusCode: response.statusCode ?? 0,
          headers,
          requestId: requestId ?? undefined,
        },
      };

      this.dispatchHistory.push(record);
      logger.info({
        channel: 'email',
        provider: 'sendgrid',
        from: this.config.sender,
        to: payload.recipients,
        subject: payload.subject,
        eventId: payload.eventId,
        eventType: payload.eventType,
        providerMessageId,
        statusCode: response.statusCode,
      }, 'Email notification dispatched');

      return record;
    });
  }

  getHistory(): ReadonlyArray<EmailDispatchRecord> {
    return this.dispatchHistory;
  }

  reset() {
    this.dispatchHistory.length = 0;
  }

  private async dispatchWithProvider(payload: EmailNotificationPayload): Promise<[ClientResponse, unknown]> {
    const message: MailDataRequired = {
      from: this.config.sender,
      to: payload.recipients,
      subject: payload.subject,
      text: payload.body,
      categories: this.config.categories,
      headers: {
        'x-imm-event-id': payload.eventId,
        'x-imm-event-type': payload.eventType,
      },
    };

    try {
      return await sgMail.send(message, false);
    } catch (error) {
      this.handleSendError(error, payload);
      throw error; // will never reach but satisfies TypeScript
    }
  }

  private handleSendError(error: unknown, payload: EmailNotificationPayload): never {
    if (this.isResponseError(error)) {
      const details = error.response?.body as { errors?: Array<{ message?: string; field?: string }> } | undefined;
      const firstError = details?.errors?.[0];
      const message = firstError?.message ?? error.message;

      logger.error({
        channel: 'email',
        provider: 'sendgrid',
        to: payload.recipients,
        subject: payload.subject,
        eventId: payload.eventId,
        statusCode: error.code ?? error.response?.statusCode,
        providerErrors: details?.errors,
      }, 'Email provider rejected notification');

      throw new Error(`SendGrid rejected email: ${message}`);
    }

    logger.error({
      channel: 'email',
      provider: 'sendgrid',
      to: payload.recipients,
      subject: payload.subject,
      eventId: payload.eventId,
      error,
    }, 'Unexpected error when dispatching email notification');

    throw error instanceof Error ? error : new Error('Unknown email dispatch error');
  }

  private isResponseError(error: unknown): error is ResponseError & { code?: number } {
    return Boolean(error && typeof error === 'object' && 'response' in error);
  }

  private normalizeHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (Array.isArray(value)) {
        normalized[key.toLowerCase()] = value[0];
      } else if (typeof value === 'string') {
        normalized[key.toLowerCase()] = value;
      } else if (value !== undefined) {
        normalized[key.toLowerCase()] = String(value);
      }
    }
    return normalized;
  }

  private getHeaderValue(headers: Record<string, string>, header: string): string | undefined {
    const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === header.toLowerCase());
    return entry?.[1];
  }
}
