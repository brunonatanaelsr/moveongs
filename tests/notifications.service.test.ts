import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendGridMocks = vi.hoisted(() => ({
  send: vi.fn(),
  setApiKey: vi.fn(),
}));

const twilioMocks = vi.hoisted(() => {
  const create = vi.fn();
  const factory = vi.fn(() => ({
    messages: {
      create,
    },
  }));
  class TwilioError extends Error {
    status?: number;
    code?: number;
    moreInfo?: string;

    constructor(message: string, status?: number, code?: number, moreInfo?: string) {
      super(message);
      this.status = status;
      this.code = code;
      this.moreInfo = moreInfo;
    }
  }
  return { create, factory, TwilioError };
});

vi.mock('@sendgrid/mail', () => ({
  __esModule: true,
  default: {
    send: sendGridMocks.send,
    setApiKey: sendGridMocks.setApiKey,
  },
  send: sendGridMocks.send,
  setApiKey: sendGridMocks.setApiKey,
}));

vi.mock('twilio', () => ({
  __esModule: true,
  default: twilioMocks.factory,
  Twilio: twilioMocks.factory,
  TwilioError: twilioMocks.TwilioError,
}));

let sequence = 0;

describe('notification service', () => {
  let publishNotificationEvent: (event: any) => void;
  let waitForNotificationQueue: () => Promise<void>;
  let getEmailDispatchHistory: () => ReadonlyArray<any>;
  let getWhatsappDispatchHistory: () => ReadonlyArray<any>;
  let resetNotificationDispatchHistory: () => void;
  let getNotificationMetricsSnapshot: () => any;
  let getNotificationDeadLetters: () => ReadonlyArray<any>;
  let retryNotificationDeadLetter: (id: string) => boolean;
  let getNotificationDispatchResults: () => ReadonlyArray<any>;
  let addWebhookSubscription: (input: any) => any;
  let clearWebhookSubscriptions: () => void;
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: any;

  beforeEach(async () => {
    vi.resetModules();

    sequence = 0;
    sendGridMocks.send.mockReset();
    sendGridMocks.setApiKey.mockReset();
    twilioMocks.create.mockReset();
    twilioMocks.factory.mockReset();

    sendGridMocks.send.mockImplementation(async () => [{
      statusCode: 202,
      headers: {
        'x-message-id': `sg-msg-${++sequence}`,
        'x-request-id': `sg-req-${sequence}`,
      },
    } as any]);

    twilioMocks.factory.mockImplementation(() => ({
      messages: {
        create: twilioMocks.create,
      },
    }));

    twilioMocks.create.mockImplementation(async (options: any) => ({
      sid: `SM${++sequence}`,
      status: 'queued',
      ...options,
    }));

    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://imm:test@localhost:5432/imm_test';
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-imm-123456789012345678901234567890';
    process.env.NOTIFICATIONS_EMAIL_PROVIDER = 'sendgrid';
    process.env.NOTIFICATIONS_EMAIL_SENDGRID_API_KEY = 'SG.test-key'.padEnd(24, 'x');
    process.env.NOTIFICATIONS_EMAIL_FROM = 'alerts@imm.local';
    process.env.NOTIFICATIONS_EMAIL_DEFAULT_RECIPIENTS = 'alerts@example.com';
    process.env.NOTIFICATIONS_EMAIL_RECIPIENTS = '';
    process.env.NOTIFICATIONS_WHATSAPP_PROVIDER = 'twilio';
    process.env.NOTIFICATIONS_WHATSAPP_TWILIO_ACCOUNT_SID = 'AC1234567890';
    process.env.NOTIFICATIONS_WHATSAPP_TWILIO_AUTH_TOKEN = 'secret';
    process.env.NOTIFICATIONS_WHATSAPP_FROM = 'whatsapp:+14155238886';
    process.env.NOTIFICATIONS_WHATSAPP_DEFAULT_NUMBERS = '+5511999999999';
    process.env.NOTIFICATIONS_WHATSAPP_NUMBERS = '';
    process.env.NOTIFICATIONS_WHATSAPP_RATE_LIMIT_PER_SECOND = '10';
    process.env.NOTIFICATIONS_WEBHOOK_TIMEOUT_MS = '100';
    process.env.NOTIFICATIONS_WEBHOOK_SECRET = 'global-secret';

    fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    originalFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = fetchMock;

    const serviceModule = await import('../src/modules/notifications/service');
    publishNotificationEvent = serviceModule.publishNotificationEvent;
    waitForNotificationQueue = serviceModule.waitForNotificationQueue;
    getEmailDispatchHistory = serviceModule.getEmailDispatchHistory;
    getWhatsappDispatchHistory = serviceModule.getWhatsappDispatchHistory;
    resetNotificationDispatchHistory = serviceModule.resetNotificationDispatchHistory;
    getNotificationMetricsSnapshot = serviceModule.getNotificationMetricsSnapshot;
    getNotificationDeadLetters = serviceModule.getNotificationDeadLetters;
    retryNotificationDeadLetter = serviceModule.retryNotificationDeadLetter;
    getNotificationDispatchResults = serviceModule.getNotificationDispatchResults;

    const registryModule = await import('../src/modules/notifications/webhook-registry');
    addWebhookSubscription = registryModule.addWebhookSubscription;
    clearWebhookSubscriptions = registryModule.clearWebhookSubscriptions;
  });

  afterEach(() => {
    clearWebhookSubscriptions?.();
    resetNotificationDispatchHistory?.();
    if ((globalThis as any).fetch === fetchMock) {
      if (originalFetch) {
        (globalThis as any).fetch = originalFetch;
      } else {
        delete (globalThis as any).fetch;
      }
    }
    vi.restoreAllMocks();
    sendGridMocks.send.mockReset();
    sendGridMocks.setApiKey.mockReset();
    twilioMocks.create.mockReset();
    twilioMocks.factory.mockReset();
  });

  it('dispara notificações multi canal para eventos de matrícula', async () => {
    const webhook = addWebhookSubscription({
      event: 'enrollment.created',
      url: 'https://example.org/hooks/enrollments',
      secret: 'secret-token',
    });

    publishNotificationEvent({
      id: 'evt-enrollment-1',
      type: 'enrollment.created',
      data: {
        enrollmentId: 'enr-1',
        beneficiaryId: 'ben-1',
        beneficiaryName: 'Maria de Teste',
        cohortId: 'cohort-1',
        cohortCode: 'TURMA-A',
        projectId: 'proj-1',
        projectName: 'Projeto Teste',
        status: 'active',
        enrolledAt: '2024-01-10',
      },
    });

    await waitForNotificationQueue();

    const emails = getEmailDispatchHistory();
    const whatsappMessages = getWhatsappDispatchHistory();
    const results = getNotificationDispatchResults();

    expect(sendGridMocks.setApiKey).toHaveBeenCalledTimes(1);
    expect(twilioMocks.factory).toHaveBeenCalledWith('AC1234567890', 'secret');

    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({
      recipients: ['alerts@example.com'],
      provider: 'sendgrid',
      providerResponse: expect.objectContaining({ statusCode: 202 }),
    });

    expect(whatsappMessages).toHaveLength(1);
    expect(whatsappMessages[0]).toMatchObject({
      number: '+5511999999999',
      provider: 'twilio',
      status: 'queued',
    });

    expect(results.find((entry) => entry.channel === 'email')).toMatchObject({
      record: expect.objectContaining({ providerMessageId: expect.stringContaining('sg-msg-') }),
    });
    expect(results.filter((entry) => entry.channel === 'whatsapp')).toHaveLength(1);

    expect(sendGridMocks.send).toHaveBeenCalledWith(expect.objectContaining({
      from: 'alerts@imm.local',
      to: ['alerts@example.com'],
    }), false);
    expect(twilioMocks.create).toHaveBeenCalledWith(expect.objectContaining({
      from: 'whatsapp:+14155238886',
      to: 'whatsapp:+5511999999999',
    }));

    expect(fetchMock).toHaveBeenCalledWith('https://example.org/hooks/enrollments', expect.objectContaining({
      method: 'POST',
    }));

    const [, requestInit] = fetchMock.mock.calls[0];
    const headers = requestInit?.headers as Record<string, string>;
    const signature = headers['x-imm-webhook-signature'];
    expect(signature).toBeDefined();

    const expectedSignature = `sha256=${createHmac('sha256', webhook.secret)
      .update(`${headers['x-imm-webhook-timestamp']}.${requestInit?.body}`)
      .digest('hex')}`;
    expect(signature).toBe(expectedSignature);
  });

  it('dispara alertas de risco de assiduidade em múltiplos canais', async () => {
    const webhook = addWebhookSubscription({
      event: 'attendance.low_attendance',
      url: 'https://example.org/hooks/attendance-risk',
    });

    publishNotificationEvent({
      id: 'evt-attendance-risk',
      type: 'attendance.low_attendance',
      data: {
        enrollmentId: 'enr-42',
        beneficiaryId: 'ben-99',
        beneficiaryName: 'Joana de Teste',
        cohortId: 'cohort-2',
        cohortCode: 'TURMA-B',
        projectId: 'proj-7',
        projectName: 'Projeto Exemplo',
        attendanceRate: 0.6,
        threshold: 0.75,
        totalSessions: 10,
        presentSessions: 6,
      },
    });

    await waitForNotificationQueue();

    const emails = getEmailDispatchHistory();
    const whatsappMessages = getWhatsappDispatchHistory();

    expect(emails[0]).toMatchObject({ eventType: 'attendance.low_attendance' });
    expect(whatsappMessages[0]).toMatchObject({ eventType: 'attendance.low_attendance' });

    const [, requestInit] = fetchMock.mock.calls.at(-1) ?? [];
    const headers = requestInit?.headers as Record<string, string>;
    expect(headers['x-imm-webhook-delivery']).toBe(`${webhook.id}:evt-attendance-risk`);
  });

  it('dispara lembretes e alertas para itens de ação', async () => {
    publishNotificationEvent({
      id: 'evt-action-due-soon',
      type: 'action_item.due_soon',
      data: {
        actionPlanId: 'plan-1',
        actionItemId: 'item-1',
        beneficiaryId: 'ben-123',
        beneficiaryName: 'Fulana de Tal',
        title: 'Enviar documentação',
        dueDate: '2024-06-20',
        responsible: 'Equipe Social',
        status: 'in_progress',
        dueInDays: 1,
      },
    });

    publishNotificationEvent({
      id: 'evt-action-overdue',
      type: 'action_item.overdue',
      data: {
        actionPlanId: 'plan-2',
        actionItemId: 'item-2',
        beneficiaryId: 'ben-999',
        beneficiaryName: null,
        title: 'Realizar visita domiciliar',
        dueDate: '2024-05-01',
        responsible: null,
        status: 'pending',
        overdueByDays: 4,
      },
    });

    await waitForNotificationQueue();

    const emails = getEmailDispatchHistory();
    const whatsapps = getWhatsappDispatchHistory();

    expect(emails.map((entry) => entry.eventType)).toEqual([
      'action_item.due_soon',
      'action_item.overdue',
    ]);
    expect(whatsapps.map((entry) => entry.eventType)).toEqual([
      'action_item.due_soon',
      'action_item.overdue',
    ]);
  });

  it('atualiza métricas e mantém idempotência', async () => {
    const event = {
      id: 'evt-consent',
      type: 'consent.recorded',
      data: {
        consentId: 'consent-1',
        beneficiaryId: 'ben-200',
        type: 'lgpd',
        textVersion: 'v1',
        granted: true,
        grantedAt: '2024-04-05',
        revokedAt: null,
      },
    };

    publishNotificationEvent(event);
    publishNotificationEvent(event);

    await waitForNotificationQueue();

    const metrics = getNotificationMetricsSnapshot();
    expect(metrics.email.delivered).toBe(1);
    expect(metrics.whatsapp.delivered).toBe(1);
    expect(metrics.email.duplicates).toBe(1);
    expect(metrics.whatsapp.duplicates).toBe(1);
  });

  it('encaminha falhas para a DLQ e permite retry', async () => {
    sendGridMocks.send.mockRejectedValue(new Error('sendgrid-down'));

    publishNotificationEvent({
      id: 'evt-dlq-1',
      type: 'action_item.due_soon',
      data: {
        actionPlanId: 'plan-dlq',
        actionItemId: 'item-dlq',
        beneficiaryId: 'ben-dlq',
        beneficiaryName: 'Pessoa DLQ',
        title: 'Enviar documentação',
        dueDate: '2024-07-10',
        responsible: 'Equipe',
        status: 'in_progress',
        dueInDays: 2,
      },
    });

    await waitForNotificationQueue();

    const deadLetters = getNotificationDeadLetters();
    expect(deadLetters).toHaveLength(1);
    expect(deadLetters[0]).toMatchObject({ error: expect.stringContaining('sendgrid') });

    sendGridMocks.send.mockReset();
    sendGridMocks.send.mockImplementation(async () => [{
      statusCode: 202,
      headers: {
        'x-message-id': `sg-msg-${++sequence}`,
        'x-request-id': `sg-req-${sequence}`,
      },
    } as any]);

    const retried = retryNotificationDeadLetter(deadLetters[0].id);
    expect(retried).toBe(true);

    await waitForNotificationQueue();

    expect(getNotificationDeadLetters()).toHaveLength(0);
    expect(getEmailDispatchHistory()).toHaveLength(1);
  });

  it('registra falhas do WhatsApp na DLQ com informação do provedor', async () => {
    twilioMocks.create.mockRejectedValue(Object.assign(new Error('twilio-rate-limit'), {
      status: 429,
      code: 20429,
    }));

    publishNotificationEvent({
      id: 'evt-wa-dlq',
      type: 'attendance.recorded',
      data: {
        attendanceId: 'att-1',
        enrollmentId: 'enr-1',
        date: '2024-06-01',
        present: true,
        justification: null,
      },
    });

    await waitForNotificationQueue();

    const deadLetters = getNotificationDeadLetters();
    expect(deadLetters).toHaveLength(1);
    expect(deadLetters[0]).toMatchObject({
      job: expect.objectContaining({ channel: 'whatsapp' }),
      error: 'twilio-rate-limit',
    });
    twilioMocks.create.mockReset();
    twilioMocks.create.mockImplementation(async (options: any) => ({
      sid: `SM${++sequence}`,
      status: 'queued',
      ...options,
    }));
  });
});
