import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('notification service', () => {
  let publishNotificationEvent: (event: any) => void;
  let waitForNotificationQueue: () => Promise<void>;
  let getEmailDispatchHistory: () => ReadonlyArray<any>;
  let getWhatsappDispatchHistory: () => ReadonlyArray<any>;
  let resetNotificationDispatchHistory: () => void;
  let addWebhookSubscription: (input: any) => any;
  let clearWebhookSubscriptions: () => void;
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: any;

  beforeEach(async () => {
    vi.resetModules();

    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://imm:test@localhost:5432/imm_test';
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-imm-123456789012345678901234567890';
    process.env.NOTIFICATIONS_EMAIL_RECIPIENTS = 'alerts@example.com';
    process.env.NOTIFICATIONS_WHATSAPP_NUMBERS = '+5511999999999';
    process.env.NOTIFICATIONS_WEBHOOK_TIMEOUT_MS = '100';

    fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    originalFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = fetchMock;

    const serviceModule = await import('../src/modules/notifications/service');
    publishNotificationEvent = serviceModule.publishNotificationEvent;
    waitForNotificationQueue = serviceModule.waitForNotificationQueue;
    getEmailDispatchHistory = serviceModule.getEmailDispatchHistory;
    getWhatsappDispatchHistory = serviceModule.getWhatsappDispatchHistory;
    resetNotificationDispatchHistory = serviceModule.resetNotificationDispatchHistory;

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
    addWebhookSubscription({
      event: 'enrollment.created',
      url: 'https://example.org/hooks/enrollments',
      secret: 'secret-token',
    });

    publishNotificationEvent({
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

    expect(fetchMock).toHaveBeenCalledWith('https://example.org/hooks/enrollments', expect.objectContaining({
      method: 'POST',
    }));
  });
});

