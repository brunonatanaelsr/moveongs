import { getEnv } from '../../config/env';
import { logger } from '../../config/logger';
import { JobQueue } from '../../shared/job-queue';
import type { WebhookSubscription } from './webhook-registry';
import { getWebhooksForEvent } from './webhook-registry';
import type { NotificationEvent } from './types';

type EmailNotificationPayload = {
  recipients: string[];
  subject: string;
  body: string;
  eventType: NotificationEvent['type'];
};

type EmailMessage = {
  subject: string;
  body: string;
  recipients?: string[];
};

type WhatsAppNotificationPayload = {
  numbers: string[];
  message: string;
  eventType: NotificationEvent['type'];
};

type NotificationEventWithTimestamp = NotificationEvent & { triggeredAt: string };

type WebhookJobPayload = {
  subscription: WebhookSubscription;
  event: NotificationEventWithTimestamp;
};

type NotificationJob =
  | { type: 'email'; payload: EmailNotificationPayload }
  | { type: 'whatsapp'; payload: WhatsAppNotificationPayload }
  | { type: 'webhook'; payload: WebhookJobPayload };

const emailDispatchHistory: EmailNotificationPayload[] = [];
const whatsappDispatchHistory: WhatsAppNotificationPayload[] = [];

const env = getEnv();

const emailRecipients = (env.NOTIFICATIONS_EMAIL_RECIPIENTS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const whatsappNumbers = (env.NOTIFICATIONS_WHATSAPP_NUMBERS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const webhookTimeoutMs = Number.parseInt(env.NOTIFICATIONS_WEBHOOK_TIMEOUT_MS, 10) || 5000;

const notificationQueue = new JobQueue<NotificationJob>(async (job) => {
  switch (job.type) {
    case 'email':
      await dispatchEmail(job.payload);
      break;
    case 'whatsapp':
      await dispatchWhatsApp(job.payload);
      break;
    case 'webhook':
      await dispatchWebhook(job.payload);
      break;
    default:
      // Exhaustive check
      throw new Error(`Unsupported notification job type ${(job as NotificationJob).type}`);
  }
}, {
  concurrency: 3,
  maxAttempts: 5,
  backoffMs: 1500,
  onError: (error, job) => {
    logger.error({ error, jobPayload: job.payload }, 'Notification job failed after retries');
  },
});

export function publishNotificationEvent(event: NotificationEvent) {
  const normalizedEvent: NotificationEventWithTimestamp = {
    ...event,
    triggeredAt: event.triggeredAt ?? new Date().toISOString(),
  };

  const emailMessage = buildEmailMessage(normalizedEvent);
  const recipients = emailMessage?.recipients ?? emailRecipients;

  if (emailMessage && recipients.length > 0) {
    notificationQueue.enqueue({
      type: 'email',
      payload: {
        recipients,
        subject: emailMessage.subject,
        body: emailMessage.body,
        eventType: normalizedEvent.type,
      },
    });
  }

  const whatsappMessage = buildWhatsAppMessage(normalizedEvent);
  if (whatsappMessage && whatsappNumbers.length > 0) {
    notificationQueue.enqueue({
      type: 'whatsapp',
      payload: {
        numbers: whatsappNumbers,
        message: whatsappMessage,
        eventType: normalizedEvent.type,
      },
    });
  }

  const webhooks = getWebhooksForEvent(normalizedEvent.type);
  for (const subscription of webhooks) {
    notificationQueue.enqueue({
      type: 'webhook',
      payload: {
        subscription,
        event: normalizedEvent,
      },
    });
  }
}

async function dispatchEmail(payload: EmailNotificationPayload) {
  emailDispatchHistory.push(payload);
  logger.info({
    to: payload.recipients,
    subject: payload.subject,
    event: payload.eventType,
  }, 'Email notification dispatched');
}

async function dispatchWhatsApp(payload: WhatsAppNotificationPayload) {
  whatsappDispatchHistory.push(payload);
  logger.info({
    to: payload.numbers,
    event: payload.eventType,
  }, 'WhatsApp notification dispatched');
}

async function dispatchWebhook(payload: WebhookJobPayload) {
  const fetchFn: ((input: string, init?: any) => Promise<any>) | undefined = (globalThis as any).fetch;
  if (!fetchFn) {
    throw new Error('Fetch API not available for webhook dispatch');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), webhookTimeoutMs);

  try {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-imm-event': payload.event.type,
      'x-imm-webhook-id': payload.subscription.id,
    };

    if (payload.subscription.secret) {
      headers['x-imm-webhook-secret'] = payload.subscription.secret;
    } else if (env.NOTIFICATIONS_WEBHOOK_SECRET) {
      headers['x-imm-webhook-secret'] = env.NOTIFICATIONS_WEBHOOK_SECRET;
    }

    const response = await fetchFn(payload.subscription.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        event: payload.event.type,
        triggeredAt: payload.event.triggeredAt,
        data: payload.event.data,
      }),
      signal: controller.signal,
    });

    if (!response || typeof response.ok !== 'boolean') {
      throw new Error('Webhook dispatch returned an invalid response');
    }

    if (!response.ok) {
      const status = typeof response.status === 'number' ? response.status : 'unknown';
      throw new Error(`Webhook dispatch failed with status ${status}`);
    }

    logger.info({
      event: payload.event.type,
      webhookId: payload.subscription.id,
      url: payload.subscription.url,
    }, 'Webhook notification dispatched');
  } finally {
    clearTimeout(timeout);
  }
}

function buildEmailMessage(event: NotificationEventWithTimestamp): EmailMessage | null {
  switch (event.type) {
    case 'enrollment.created':
      return {
        subject: `Nova matrícula registrada para ${event.data.beneficiaryName}`,
        body: [
          `Uma nova matrícula foi registrada para ${event.data.beneficiaryName}.`,
          `Projeto: ${event.data.projectName}`,
          event.data.cohortCode ? `Turma: ${event.data.cohortCode}` : null,
          `Status: ${event.data.status}`,
          `Data: ${event.data.enrolledAt}`,
          `ID: ${event.data.enrollmentId}`,
        ].filter(Boolean).join('\n'),
      };
    case 'attendance.recorded':
      return {
        subject: 'Nova presença registrada',
        body: [
          `Uma nova presença foi registrada em ${event.data.date}.`,
          `ID da presença: ${event.data.attendanceId}`,
          `Matrícula: ${event.data.enrollmentId}`,
          `Situação: ${event.data.present ? 'Presente' : 'Ausente'}`,
          event.data.justification ? `Justificativa: ${event.data.justification}` : null,
        ].filter(Boolean).join('\n'),
      };
    case 'attendance.low_attendance': {
      const ratePercent = (event.data.attendanceRate * 100).toFixed(1);
      const thresholdPercent = (event.data.threshold * 100).toFixed(0);
      return {
        subject: `Alerta de baixa assiduidade - ${event.data.beneficiaryName}`,
        body: [
          `A matrícula ${event.data.enrollmentId} está com assiduidade de ${ratePercent}%.`,
          `Projeto: ${event.data.projectName}`,
          event.data.cohortCode ? `Turma: ${event.data.cohortCode}` : null,
          `Total de encontros: ${event.data.totalSessions}`,
          `Presenças: ${event.data.presentSessions}`,
          `Limite mínimo: ${thresholdPercent}%`,
        ].filter(Boolean).join('\n'),
      };
    }
    case 'consent.recorded':
      return {
        subject: `Novo consentimento (${event.data.type})`,
        body: [
          `Um consentimento do tipo ${event.data.type} foi registrado.`,
          `Beneficiário(a): ${event.data.beneficiaryId}`,
          `Versão do texto: ${event.data.textVersion}`,
          `Concedido em: ${event.data.grantedAt}`,
        ].join('\n'),
      };
    case 'consent.updated':
      return {
        subject: `Consentimento atualizado (${event.data.type})`,
        body: [
          `O consentimento ${event.data.consentId} foi atualizado.`,
          `Beneficiário(a): ${event.data.beneficiaryId}`,
          `Situação: ${event.data.granted ? 'Ativo' : 'Revogado'}`,
          event.data.revokedAt ? `Revogado em: ${event.data.revokedAt}` : null,
        ].filter(Boolean).join('\n'),
      };
    case 'action_item.due_soon': {
      const beneficiary = event.data.beneficiaryName ?? event.data.beneficiaryId;
      const dueText = event.data.dueInDays <= 0
        ? 'vence hoje'
        : `vence em ${event.data.dueInDays} dia(s)`;
      return {
        subject: `Ação próxima do prazo - ${event.data.title}`,
        body: [
          `Ação "${event.data.title}" ${dueText}.`,
          `Beneficiário(a): ${beneficiary}`,
          `Plano de ação: ${event.data.actionPlanId}`,
          `Data limite: ${event.data.dueDate}`,
          event.data.responsible ? `Responsável: ${event.data.responsible}` : null,
          `Status atual: ${event.data.status}`,
        ].filter(Boolean).join('\n'),
      };
    }
    case 'action_item.overdue': {
      const beneficiary = event.data.beneficiaryName ?? event.data.beneficiaryId;
      const overdueText = event.data.overdueByDays <= 1
        ? '1 dia'
        : `${event.data.overdueByDays} dias`;
      return {
        subject: `Ação em atraso - ${event.data.title}`,
        body: [
          `Ação "${event.data.title}" atrasada há ${overdueText}.`,
          `Beneficiário(a): ${beneficiary}`,
          `Plano de ação: ${event.data.actionPlanId}`,
          `Data limite: ${event.data.dueDate}`,
          event.data.responsible ? `Responsável: ${event.data.responsible}` : null,
          `Status atual: ${event.data.status}`,
        ].filter(Boolean).join('\n'),
      };
    }
    case 'auth.password_reset_requested':
      return {
        subject: 'Redefinição de senha solicitada',
        recipients: [event.data.email],
        body: [
          `Olá ${event.data.name},`,
          '',
          'Recebemos um pedido para redefinir sua senha no IMM.',
          `Use o link abaixo para escolher uma nova senha (válido até ${event.data.expiresAt}):`,
          event.data.resetUrl,
          '',
          'Se você não solicitou essa redefinição, ignore esta mensagem.',
        ].join('\n'),
      };
    default:
      return null;
  }
}

function buildWhatsAppMessage(event: NotificationEventWithTimestamp): string | null {
  switch (event.type) {
    case 'enrollment.created':
      return `Nova matrícula: ${event.data.beneficiaryName} no projeto ${event.data.projectName}`;
    case 'attendance.recorded':
      return `Presença registrada (${event.data.present ? 'presente' : 'ausente'}) em ${event.data.date}.`;
    case 'attendance.low_attendance': {
      const ratePercent = Math.round(event.data.attendanceRate * 100);
      const thresholdPercent = Math.round(event.data.threshold * 100);
      return `Alerta: ${event.data.beneficiaryName} com assiduidade de ${ratePercent}% (mínimo ${thresholdPercent}%).`;
    }
    case 'consent.recorded':
      return `Consentimento ${event.data.type} registrado para beneficiário ${event.data.beneficiaryId}.`;
    case 'consent.updated':
      return `Consentimento ${event.data.type} atualizado (${event.data.granted ? 'ativo' : 'revogado'}).`;
    case 'action_item.due_soon': {
      const beneficiary = event.data.beneficiaryName ?? event.data.beneficiaryId;
      const dueText = event.data.dueInDays <= 0
        ? 'vence hoje'
        : `vence em ${event.data.dueInDays} dia(s)`;
      return `Lembrete: ação "${event.data.title}" ${dueText} (beneficiário ${beneficiary}).`;
    }
    case 'action_item.overdue': {
      const beneficiary = event.data.beneficiaryName ?? event.data.beneficiaryId;
      const overdueText = event.data.overdueByDays <= 1
        ? '1 dia'
        : `${event.data.overdueByDays} dias`;
      return `Alerta: ação "${event.data.title}" atrasada há ${overdueText} (beneficiário ${beneficiary}).`;
    }
    case 'auth.password_reset_requested':
      return null;
    default:
      return null;
  }
}

export async function waitForNotificationQueue() {
  await notificationQueue.onIdle();
}

export function getEmailDispatchHistory(): ReadonlyArray<EmailNotificationPayload> {
  return emailDispatchHistory;
}

export function getWhatsappDispatchHistory(): ReadonlyArray<WhatsAppNotificationPayload> {
  return whatsappDispatchHistory;
}

export function resetNotificationDispatchHistory() {
  emailDispatchHistory.length = 0;
  whatsappDispatchHistory.length = 0;
}

