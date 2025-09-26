import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionItemRecord, ActionPlanRecord } from '../src/modules/action-plans/repository';
import { addActionItem, runActionItemReminderScan, updateActionItem } from '../src/modules/action-plans/service';

const {
  createActionItemMock,
  updateActionItemMock,
  getActionItemByIdMock,
  listActionItemsDueBeforeMock,
  getBeneficiaryNameByIdMock,
} = vi.hoisted(() => ({
  createActionItemMock: vi.fn(),
  updateActionItemMock: vi.fn(),
  getActionItemByIdMock: vi.fn(),
  listActionItemsDueBeforeMock: vi.fn(),
  getBeneficiaryNameByIdMock: vi.fn(),
}));

const { recordAuditLogMock } = vi.hoisted(() => ({
  recordAuditLogMock: vi.fn(),
}));

const { publishNotificationEventMock } = vi.hoisted(() => ({
  publishNotificationEventMock: vi.fn(),
}));

vi.mock('../src/modules/action-plans/repository', () => ({
  createActionItem: createActionItemMock,
  updateActionItem: updateActionItemMock,
  getActionItemById: getActionItemByIdMock,
  getActionPlan: vi.fn(),
  listActionItemsForBeneficiary: vi.fn(),
  listActionPlans: vi.fn(),
  createActionPlan: vi.fn(),
  updateActionPlan: vi.fn(),
  listActionItemsDueBefore: listActionItemsDueBeforeMock,
  getBeneficiaryNameById: getBeneficiaryNameByIdMock,
}));

vi.mock('../src/shared/audit', () => ({
  recordAuditLog: recordAuditLogMock,
}));

vi.mock('../src/modules/notifications/service', () => ({
  publishNotificationEvent: publishNotificationEventMock,
}));

describe('action plan service notifications', () => {
  const basePlan: ActionPlanRecord = {
    id: 'plan-1',
    beneficiaryId: 'ben-1',
    status: 'active',
    createdBy: 'user-1',
    createdAt: '2024-06-01T00:00:00.000Z',
    updatedAt: '2024-06-01T00:00:00.000Z',
    items: [],
  };

  const createItem = (overrides?: Partial<ActionItemRecord>): ActionItemRecord => ({
    id: overrides?.id ?? 'item-1',
    actionPlanId: overrides?.actionPlanId ?? 'plan-1',
    title: overrides?.title ?? 'Preparar documentação',
    responsible: overrides?.responsible ?? 'Equipe Social',
    dueDate: overrides?.dueDate ?? '2024-06-11',
    status: overrides?.status ?? 'pending',
    support: overrides?.support ?? null,
    notes: overrides?.notes ?? null,
    completedAt: overrides?.completedAt ?? null,
    createdAt: overrides?.createdAt ?? '2024-06-01T00:00:00.000Z',
    updatedAt: overrides?.updatedAt ?? '2024-06-01T00:00:00.000Z',
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-10T12:00:00.000Z'));
    vi.clearAllMocks();
    recordAuditLogMock.mockResolvedValue(undefined);
    getBeneficiaryNameByIdMock.mockResolvedValue('Fulana de Tal');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('publica evento de item próximo do prazo ao criar ação', async () => {
    const planWithItem: ActionPlanRecord = {
      ...basePlan,
      items: [createItem({ id: 'item-new', dueDate: '2024-06-11' })],
    };
    createActionItemMock.mockResolvedValue(planWithItem);

    await addActionItem({
      actionPlanId: basePlan.id,
      title: 'Preparar documentação',
      dueDate: '2024-06-11',
    });

    expect(publishNotificationEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'action_item.due_soon',
        data: expect.objectContaining({
          actionItemId: 'item-new',
          beneficiaryName: 'Fulana de Tal',
          dueInDays: 1,
        }),
      }),
    );
  });

  it('publica evento de atraso ao atualizar ação vencida', async () => {
    const existingItem = createItem({ id: 'item-2', dueDate: '2024-06-05' });
    getActionItemByIdMock.mockResolvedValue(existingItem);

    const updatedPlan: ActionPlanRecord = {
      ...basePlan,
      items: [existingItem],
    };
    updateActionItemMock.mockResolvedValue(updatedPlan);

    await updateActionItem({
      actionPlanId: basePlan.id,
      itemId: 'item-2',
      dueDate: '2024-06-05',
    });

    expect(publishNotificationEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'action_item.overdue',
        data: expect.objectContaining({
          actionItemId: 'item-2',
          overdueByDays: expect.any(Number),
        }),
      }),
    );
  });

  it('varre itens pendentes e publica eventos conforme prazo', async () => {
    const dueSoon = createItem({ id: 'item-3', dueDate: '2024-06-12' });
    const overdue = createItem({ id: 'item-4', dueDate: '2024-06-08' });

    listActionItemsDueBeforeMock.mockResolvedValue([
      { ...dueSoon, beneficiaryId: 'ben-1', beneficiaryName: 'Fulana de Tal' },
      { ...overdue, beneficiaryId: 'ben-2', beneficiaryName: null },
    ]);

    await runActionItemReminderScan(new Date('2024-06-10T12:00:00.000Z'));

    expect(publishNotificationEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'action_item.due_soon' }),
    );
    expect(publishNotificationEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'action_item.overdue' }),
    );
  });

  it('mantém dueDate e responsável quando não informados na atualização', async () => {
    const existingItem = createItem({ id: 'item-5', dueDate: '2024-06-20', responsible: 'Responsável' });
    getActionItemByIdMock.mockResolvedValue(existingItem);

    const updatedPlan: ActionPlanRecord = {
      ...basePlan,
      items: [existingItem],
    };

    updateActionItemMock.mockResolvedValue(updatedPlan);

    const result = await updateActionItem({
      actionPlanId: basePlan.id,
      itemId: existingItem.id,
      status: 'in_progress',
    });

    expect(updateActionItemMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actionPlanId: basePlan.id,
        itemId: existingItem.id,
        status: 'in_progress',
      }),
    );

    const payload = updateActionItemMock.mock.calls[0][0];
    expect(payload).not.toHaveProperty('dueDate');
    expect(payload).not.toHaveProperty('responsible');

    const updatedItem = result.items.find((item) => item.id === existingItem.id);
    expect(updatedItem?.dueDate).toBe(existingItem.dueDate);
    expect(updatedItem?.responsible).toBe(existingItem.responsible);
  });

  it('preserva o dueDate armazenado quando o campo não é enviado na atualização', async () => {
    const existingItem = createItem({ id: 'item-6', dueDate: '2024-07-15' });
    getActionItemByIdMock.mockResolvedValue(existingItem);

    const updatedPlan: ActionPlanRecord = {
      ...basePlan,
      items: [existingItem],
    };

    updateActionItemMock.mockResolvedValue(updatedPlan);

    const result = await updateActionItem({
      actionPlanId: basePlan.id,
      itemId: existingItem.id,
      notes: 'Atualizar observações',
    });

    expect(updateActionItemMock.mock.calls[0][0]).not.toHaveProperty('dueDate');

    const updatedItem = result.items.find((item) => item.id === existingItem.id);
    expect(updatedItem?.dueDate).toBe(existingItem.dueDate);
  });
});
