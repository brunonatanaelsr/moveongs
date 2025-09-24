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

  it('dispara alertas de risco de assiduidade em múltiplos canais', async () => {
    addWebhookSubscription({
      event: 'attendance.low_attendance',
      url: 'https://example.org/hooks/attendance-risk',
    });

    publishNotificationEvent({
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
  });

  it('dispara lembretes para itens de ação próximos do prazo', async () => {
    addWebhookSubscription({
      event: 'action_item.due_soon',
      url: 'https://example.org/hooks/action-items/due-soon',
    });

    publishNotificationEvent({
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
  });

  it('dispara alertas para itens de ação em atraso', async () => {
    addWebhookSubscription({
      event: 'action_item.overdue',
      url: 'https://example.org/hooks/action-items/overdue',
    });

    publishNotificationEvent({
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
  });
});

