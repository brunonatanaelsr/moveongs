import { randomUUID } from 'node:crypto';
import { getEnv } from '../../config/env';
import { logger } from '../../config/logger';
import { JobQueue } from '../../shared/job-queue';
import type { NotificationChannel, NotificationEvent } from './types';
import { getWebhooksForEvent } from './webhook-registry';
import type { WebhookSubscription } from './webhook-registry';
import { EmailNotificationAdapter, type EmailNotificationPayload } from './adapters/email-adapter';
import { WhatsAppNotificationAdapter, type WhatsAppNotificationPayload } from './adapters/whatsapp-adapter';
import { WebhookNotificationAdapter, type WebhookJobPayload } from './adapters/webhook-adapter';
import { NotificationMetrics, type NotificationMetricsSnapshot } from './metrics';

export type NotificationQueueJob =
  | {
    channel: 'email';
    dedupeKey: string;
    eventId: string;
    payload: EmailNotificationPayload;
    attemptsMade?: number;
    retry?: (options: { delay: number }) => Promise<void>;
  }
  | {
    channel: 'whatsapp';
    dedupeKey: string;
    eventId: string;
    payload: WhatsAppNotificationPayload;
    attemptsMade?: number;
    retry?: (options: { delay: number }) => Promise<void>;
  }
  | {
    channel: 'webhook';
    dedupeKey: string;
    eventId: string;
    payload: WebhookJobPayload;
    attemptsMade?: number;
    retry?: (options: { delay: number }) => Promise<void>;
  };

export type NotificationDeadLetter = {
  id: string;
  job: NotificationQueueJob;
  error: string;
  failedAt: string;
  attempts: number;
};

type EmailMessage = {
  subject: string;
  body: string;
  recipients?: string[];
};

type NotificationEventNormalized = NotificationEvent & { triggeredAt: string; id: string };

type QueueOptions = {
  concurrency: number;
  maxAttempts: number;
  backoffMs: number;
};

const env = getEnv();
const metrics = new NotificationMetrics();
const emailAdapter = new EmailNotificationAdapter(metrics, env.NOTIFICATIONS_EMAIL_FROM);
const whatsappAdapter = new WhatsAppNotificationAdapter(metrics);
const webhookAdapter = new WebhookNotificationAdapter(metrics);

const emailRecipients = (env.NOTIFICATIONS_EMAIL_RECIPIENTS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const whatsappNumbers = (env.NOTIFICATIONS_WHATSAPP_NUMBERS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const webhookTimeoutMs = Number.parseInt(env.NOTIFICATIONS_WEBHOOK_TIMEOUT_MS, 10) || 5000;

type NotificationServiceState = {
  processedJobKeys: Set<string>;
  deadLetterQueue: NotificationDeadLetter[];
};

const state: NotificationServiceState = {
  processedJobKeys: new Set<string>(),
  deadLetterQueue: [],
};

const queueOptions: QueueOptions = env.NODE_ENV === 'test'
  ? { concurrency: 1, maxAttempts: 2, backoffMs: 25 }
  : { concurrency: 3, maxAttempts: 5, backoffMs: 1500 };

const notificationQueue = new JobQueue<NotificationQueueJob>(async (job) => {
  if (state.processedJobKeys.has(job.dedupeKey)) {
    metrics.recordDuplicate(job.channel);
    return;
  }

  const startTime = Date.now();
  switch (job.channel) {
    case 'email':
      await emailAdapter.send(job.payload);
      break;
    case 'whatsapp':
      await whatsappAdapter.send(job.payload);
      break;
    case 'webhook':
      await webhookAdapter.send(job.payload);
      break;
  }
  const durationMs = Date.now() - startTime;

  state.processedJobKeys.add(job.dedupeKey);
  metrics.recordSuccess(job.channel, durationMs);
}, {
  concurrency: queueOptions.concurrency,
  maxAttempts: queueOptions.maxAttempts,
  backoffMs: queueOptions.backoffMs,
  onAttemptFailure: (error, job) => {
    const attempts = job.attempts;
    if (job.attempts < queueOptions.maxAttempts) {
      metrics.recordRetry(job.payload.channel);
    }
    logger.warn({ error, job, attempts }, 'Notification job attempt failed');
  },
  onError: (error, job) => {
    const entry: NotificationDeadLetter = {
      id: randomUUID(),
      job: job.payload,
      error: error instanceof Error ? error.message : String(error),
      failedAt: new Date().toISOString(),
      attempts: job.attempts,
    };
    state.deadLetterQueue.push(entry);
    metrics.recordDeadLetter(job.payload.channel);
    logger.error({ error, job }, 'Notification job failed permanently');
  },
});

export function publishNotificationEvent(event: NotificationEvent) {
  const normalizedEvent: NotificationEventNormalized = {
    ...event,
    id: event.id ?? randomUUID(),
    triggeredAt: event.triggeredAt ?? new Date().toISOString(),
  };

  const emailMessage = buildEmailMessage(normalizedEvent);
  const recipients = emailMessage?.recipients ?? emailRecipients;

  if (emailMessage && recipients.length > 0) {
    const recipientsKey = buildTargetKey(recipients);
    notificationQueue.enqueue({
      channel: 'email',
      dedupeKey: buildJobKey('email', normalizedEvent.id, recipientsKey),
      eventId: normalizedEvent.id,
      payload: {
        ...emailMessage,
        recipients,
        eventType: normalizedEvent.type,
        eventId: normalizedEvent.id,
      },
    });
  }

  const whatsappMessage = buildWhatsAppMessage(normalizedEvent);
  if (whatsappMessage && whatsappNumbers.length > 0) {
    const numbersKey = buildTargetKey(whatsappNumbers);
    notificationQueue.enqueue({
      channel: 'whatsapp',
      dedupeKey: buildJobKey('whatsapp', normalizedEvent.id, numbersKey),
      eventId: normalizedEvent.id,
      payload: {
        numbers: whatsappNumbers,
        message: whatsappMessage,
        eventType: normalizedEvent.type,
        eventId: normalizedEvent.id,
      },
    });
  }

  const webhooks = getWebhooksForEvent(normalizedEvent.type);
  for (const subscription of webhooks) {
    notificationQueue.enqueue({
      channel: 'webhook',
      dedupeKey: buildJobKey('webhook', normalizedEvent.id, subscription.id),
      eventId: normalizedEvent.id,
      payload: buildWebhookPayload(subscription, normalizedEvent),
    });
  }
}

export async function waitForNotificationQueue() {
  await notificationQueue.onIdle();
}

export function getEmailDispatchHistory() {
  return emailAdapter.getHistory();
}

export function getWhatsappDispatchHistory() {
  return whatsappAdapter.getHistory();
}

export function resetNotificationDispatchHistory() {
  emailAdapter.reset();
  whatsappAdapter.reset();
  webhookAdapter.reset();
  state.processedJobKeys.clear();
  state.deadLetterQueue.length = 0;
  metrics.reset();
}

export function getNotificationMetricsSnapshot(): NotificationMetricsSnapshot {
  return metrics.getSnapshot();
}

export function getNotificationDeadLetters(): ReadonlyArray<NotificationDeadLetter> {
  return state.deadLetterQueue;
}

export function retryNotificationDeadLetter(id: string): boolean {
  const index = state.deadLetterQueue.findIndex((entry) => entry.id === id);
  if (index === -1) {
    return false;
  }

  const [entry] = state.deadLetterQueue.splice(index, 1);
  metrics.recordRetry(entry.job.channel);
  notificationQueue.enqueue(entry.job);
  return true;
}

export const __testing = {
  emailAdapter,
  whatsappAdapter,
  webhookAdapter,
  metrics,
  get processedJobKeys() {
    return state.processedJobKeys;
  },
  get deadLetterQueue() {
    return state.deadLetterQueue;
  },
  state,
};

function buildJobKey(channel: NotificationChannel, eventId: string, target: string): string {
  return `${channel}:${eventId}:${target}`;
}

function buildTargetKey(values: string[]): string {
  return [...values].sort().join(',');
}

function buildWebhookPayload(subscription: WebhookSubscription, event: NotificationEventNormalized): WebhookJobPayload {
  return {
    subscription,
    event,
    timeoutMs: webhookTimeoutMs,
    defaultSecret: env.NOTIFICATIONS_WEBHOOK_SECRET ?? null,
  };
}

function buildEmailMessage(event: NotificationEventNormalized): EmailMessage | null {
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

function buildWhatsAppMessage(event: NotificationEventNormalized): string | null {
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