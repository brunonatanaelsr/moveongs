import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('notification service', () => {
  let publishNotificationEvent: (event: any) => void;
  let waitForNotificationQueue: () => Promise<void>;
  let getEmailDispatchHistory: () => ReadonlyArray<any>;
  let getWhatsappDispatchHistory: () => ReadonlyArray<any>;
  let resetNotificationDispatchHistory: () => void;
  let getNotificationMetricsSnapshot: () => any;
  let getNotificationDeadLetters: () => ReadonlyArray<any>;
  let retryNotificationDeadLetter: (id: string) => boolean;
  let testingHarness: any;
  let addWebhookSubscription: (input: any) => any;
  let clearWebhookSubscriptions: () => void;
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: any;

  beforeEach(async () => {
    vi.resetModules();

    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://imm:test@localhost:5432/imm_test';
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-imm-123456789012345678901234567890';
    process.env.NOTIFICATIONS_EMAIL_RECIPIENTS = 'alerts@example.com';
    process.env.NOTIFICATIONS_EMAIL_SES_REGION = 'sa-east-1';
    process.env.NOTIFICATIONS_EMAIL_SES_ACCESS_KEY_ID = 'test-access-key';
    process.env.NOTIFICATIONS_EMAIL_SES_SECRET_ACCESS_KEY = 'test-secret-key';
    process.env.NOTIFICATIONS_WHATSAPP_NUMBERS = '+5511999999999';
    process.env.NOTIFICATIONS_WHATSAPP_FROM = 'whatsapp:+14155238886';
    process.env.NOTIFICATIONS_WHATSAPP_TWILIO_ACCOUNT_SID = 'AC11111111111111111111111111111111';
    process.env.NOTIFICATIONS_WHATSAPP_TWILIO_AUTH_TOKEN = 'test-twilio-token';
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
    testingHarness = serviceModule.__testing;

    vi.spyOn(testingHarness.emailClient, 'send').mockImplementation(async (command) => {
      expect(command.input.Source).toBe('alerts@imm.local');
      expect(command.input.Destination?.ToAddresses).toEqual(['alerts@example.com']);
      expect(command.input.Message?.Subject?.Data).toBeDefined();
      expect(command.input.Message?.Body?.Text?.Data).toBeDefined();
      return { MessageId: 'ses-message-id', $metadata: { httpStatusCode: 200 } } as any;
    });

    vi.spyOn(testingHarness.whatsappClient.messages, 'create').mockImplementation(async (params) => {
      expect(params.from).toBe('whatsapp:+14155238886');
      expect(params.body).toBeDefined();
      expect(params.to.startsWith('whatsapp:')).toBe(true);
      return { sid: `SM${Math.random().toString(36).slice(2)}`, status: 'queued', to: params.to } as any;
    });

    const registryModule = await import('../src/modules/notifications/webhook-registry');
    addWebhookSubscription = registryModule.addWebhookSubscription;
    clearWebhookSubscriptions = registryModule.clearWebhookSubscriptions;
  });

  afterEach(() => {
    if (clearWebhookSubscriptions) {
      clearWebhookSubscriptions();
    }
    if (resetNotificationDispatchHistory) {
      resetNotificationDispatchHistory();
    }
    if ((globalThis as any).fetch === fetchMock) {
      if (originalFetch) {
        (globalThis as any).fetch = originalFetch;
      } else {
        delete (globalThis as any).fetch;
      }
    }
    vi.restoreAllMocks();
  });

  it('dispara notificações multi canal para eventos de matrícula', async () => {
    const webhook = addWebhookSubscription({
      event: 'enrollment.created',
      url: 'https://example.org/hooks/enrollments',
      secret: 'secret-token',
    });

    const event = {
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
    };

    publishNotificationEvent(event);

    await waitForNotificationQueue();

    const emails = getEmailDispatchHistory();
    const whatsappMessages = getWhatsappDispatchHistory();

    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({
      recipients: ['alerts@example.com'],
      eventType: 'enrollment.created',
    });

    expect(whatsappMessages).toHaveLength(1);
    expect(whatsappMessages[0]).toMatchObject({
      numbers: ['+5511999999999'],
      eventType: 'enrollment.created',
    });
    expect(whatsappMessages[0].deliveries).toHaveLength(1);

    expect(fetchMock).toHaveBeenCalledWith('https://example.org/hooks/enrollments', expect.objectContaining({
      method: 'POST',
    }));

    const [, requestInit] = fetchMock.mock.calls[0];
    const headers = requestInit?.headers as Record<string, string>;
    expect(headers['x-imm-webhook-delivery']).toBe(`${webhook.id}:${event.id}`);
    expect(headers['x-imm-webhook-timestamp']).toBeDefined();
    expect(headers['x-imm-webhook-signature']).toBeDefined();

    const expectedSignature = `sha256=${createHmac('sha256', webhook.secret)
      .update(`${headers['x-imm-webhook-timestamp']}.${requestInit?.body}`)
      .digest('hex')}`;

    expect(headers['x-imm-webhook-signature']).toBe(expectedSignature);

    const body = JSON.parse(requestInit?.body as string);
    expect(body).toMatchObject({
      id: event.id,
      event: event.type,
    });
  });

  it('dispara alertas de risco de assiduidade em múltiplos canais', async () => {
    const webhook = addWebhookSubscription({
      event: 'attendance.low_attendance',
      url: 'https://example.org/hooks/attendance-risk',
    });

    const event = {
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
    };

    publishNotificationEvent(event);

    await waitForNotificationQueue();

    const emails = getEmailDispatchHistory();
    const whatsappMessages = getWhatsappDispatchHistory();

    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({
      recipients: ['alerts@example.com'],
      eventType: 'attendance.low_attendance',
    });

    expect(whatsappMessages).toHaveLength(1);
    expect(whatsappMessages[0]).toMatchObject({
      numbers: ['+5511999999999'],
      eventType: 'attendance.low_attendance',
    });

    expect(fetchMock).toHaveBeenCalledWith('https://example.org/hooks/attendance-risk', expect.objectContaining({
      method: 'POST',
    }));

    const [, requestInit] = fetchMock.mock.calls.at(-1) ?? [];
    const headers = requestInit?.headers as Record<string, string>;
    expect(headers['x-imm-webhook-delivery']).toBe(`${webhook.id}:${event.id}`);
  });

  it('dispara lembretes para itens de ação próximos do prazo', async () => {
    const webhook = addWebhookSubscription({
      event: 'action_item.due_soon',
      url: 'https://example.org/hooks/action-items/due-soon',
    });

    const event = {
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
    };

    publishNotificationEvent(event);

    await waitForNotificationQueue();

    const emails = getEmailDispatchHistory();
    const whatsappMessages = getWhatsappDispatchHistory();

    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({
      recipients: ['alerts@example.com'],
      eventType: 'action_item.due_soon',
    });

    expect(whatsappMessages).toHaveLength(1);
    expect(whatsappMessages[0]).toMatchObject({
      numbers: ['+5511999999999'],
      eventType: 'action_item.due_soon',
    });

    expect(fetchMock).toHaveBeenCalledWith('https://example.org/hooks/action-items/due-soon', expect.objectContaining({
      method: 'POST',
    }));

    const [, requestInit] = fetchMock.mock.calls.at(-1) ?? [];
    const headers = requestInit?.headers as Record<string, string>;
    expect(headers['x-imm-webhook-delivery']).toBe(`${webhook.id}:${event.id}`);
  });

  it('dispara alertas para itens de ação em atraso', async () => {
    const webhook = addWebhookSubscription({
      event: 'action_item.overdue',
      url: 'https://example.org/hooks/action-items/overdue',
    });

    const event = {
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
    };

    publishNotificationEvent(event);

    await waitForNotificationQueue();

    const emails = getEmailDispatchHistory();
    const whatsappMessages = getWhatsappDispatchHistory();

    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({
      recipients: ['alerts@example.com'],
      eventType: 'action_item.overdue',
    });

    expect(whatsappMessages).toHaveLength(1);
    expect(whatsappMessages[0]).toMatchObject({
      numbers: ['+5511999999999'],
      eventType: 'action_item.overdue',
    });

    expect(fetchMock).toHaveBeenCalledWith('https://example.org/hooks/action-items/overdue', expect.objectContaining({
      method: 'POST',
    }));

    const [, requestInit] = fetchMock.mock.calls.at(-1) ?? [];
    const headers = requestInit?.headers as Record<string, string>;
    expect(headers['x-imm-webhook-delivery']).toBe(`${webhook.id}:${event.id}`);
  });

  it('gera métricas de entrega por canal', async () => {
    publishNotificationEvent({
      id: 'evt-metrics-1',
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
    });

    await waitForNotificationQueue();

    const emails = getEmailDispatchHistory();
    const whatsapps = getWhatsappDispatchHistory();
    expect(emails).toHaveLength(1);
    expect(whatsapps).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();

    const metrics = getNotificationMetricsSnapshot();
    expect(metrics.email.delivered).toBe(emails.length);
    expect(metrics.whatsapp.delivered).toBe(whatsapps.length);
    expect(metrics.webhook.delivered).toBe(fetchMock.mock.calls.length);
    expect(metrics.email.averageProcessingTimeMs).toBeGreaterThan(0);
  });

  it('é idempotente por evento e canal', async () => {
    const event = {
      id: 'evt-idempotent-1',
      type: 'consent.updated',
      data: {
        consentId: 'consent-xyz',
        beneficiaryId: 'ben-501',
        type: 'lgpd',
        textVersion: 'v1',
        granted: true,
        grantedAt: '2024-05-10',
        revokedAt: null,
      },
    };

    publishNotificationEvent(event);
    publishNotificationEvent(event);

    await waitForNotificationQueue();

    const emails = getEmailDispatchHistory();
    const whatsapps = getWhatsappDispatchHistory();
    expect(emails).toHaveLength(1);
    expect(whatsapps).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();

    const metrics = getNotificationMetricsSnapshot();
    expect(metrics.email.delivered).toBe(emails.length);
    expect(metrics.whatsapp.delivered).toBe(whatsapps.length);
    expect(metrics.email.duplicates).toBeGreaterThanOrEqual(1);
    expect(metrics.whatsapp.duplicates).toBeGreaterThanOrEqual(1);
  });

  it('encaminha falhas para a DLQ com possibilidade de reprocessamento', async () => {
    const failingSpy = vi.spyOn(testingHarness.emailAdapter, 'send')
      .mockRejectedValue(new Error('provider-down'));

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
    expect(deadLetters[0]).toMatchObject({
      job: expect.objectContaining({ channel: 'email' }),
      error: 'provider-down',
    });

    failingSpy.mockRestore();

    const retried = retryNotificationDeadLetter(deadLetters[0].id);
    expect(retried).toBe(true);

    await waitForNotificationQueue();

    const emails = getEmailDispatchHistory();
    expect(emails).toHaveLength(1);
    expect(getNotificationDeadLetters()).toHaveLength(0);
  });
});

