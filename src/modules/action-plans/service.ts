import { logger } from '../../config/logger';
import { recordAuditLog } from '../../shared/audit';
import { AppError } from '../../shared/errors';
import {
  ActionPlanRecord,
  ActionItemRecord,
  createActionItem as createActionItemRepository,
  createActionPlan as createActionPlanRepository,
  getActionItemById,
  getActionPlan,
  listActionItemsForBeneficiary,
  listActionPlans,
  updateActionItem as updateActionItemRepository,
  updateActionPlan as updateActionPlanRepository,
  listActionItemsDueBefore,
  getBeneficiaryNameById,
} from './repository';
import { publishNotificationEvent } from '../notifications/service';

const MS_PER_DAY = 86_400_000;
const ACTION_ITEM_DUE_SOON_THRESHOLD_DAYS = 3;
const ACTION_ITEM_REMINDER_INTERVAL_MS = 6 * 60 * 60 * 1000;

type BeneficiaryNameCache = Map<string, string | null>;

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function parseDateOnly(value: string): Date | null {
  const parts = value.split('-').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }
  const [year, month, day] = parts;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

async function getBeneficiaryDisplayName(params: {
  beneficiaryId: string;
  explicitName?: string | null;
  cache: BeneficiaryNameCache;
}): Promise<string | null> {
  if (params.explicitName !== undefined) {
    params.cache.set(params.beneficiaryId, params.explicitName ?? null);
    return params.explicitName ?? null;
  }

  if (params.cache.has(params.beneficiaryId)) {
    return params.cache.get(params.beneficiaryId) ?? null;
  }

  const name = await getBeneficiaryNameById(params.beneficiaryId);
  params.cache.set(params.beneficiaryId, name ?? null);
  return name ?? null;
}

async function evaluateAndPublishActionItemReminder(params: {
  actionPlanId: string;
  beneficiaryId: string;
  beneficiaryName?: string | null;
  item: ActionItemRecord;
  now?: Date;
  cache?: BeneficiaryNameCache;
}): Promise<void> {
  if (!params.item.dueDate) {
    return;
  }

  if (params.item.completedAt) {
    return;
  }

  const status = params.item.status?.toLowerCase?.() ?? '';
  if (status === 'done' || status === 'completed') {
    return;
  }

  const dueDate = parseDateOnly(params.item.dueDate);
  if (!dueDate) {
    return;
  }

  const now = params.now ?? new Date();
  const referenceDate = startOfUtcDay(now);
  const diffDays = Math.round((dueDate.getTime() - referenceDate.getTime()) / MS_PER_DAY);

  if (diffDays < 0) {
    const cache = params.cache ?? new Map<string, string | null>();
    const beneficiaryName = await getBeneficiaryDisplayName({
      beneficiaryId: params.beneficiaryId,
      explicitName: params.beneficiaryName,
      cache,
    });

    publishNotificationEvent({
      type: 'action_item.overdue',
      data: {
        actionPlanId: params.actionPlanId,
        actionItemId: params.item.id,
        beneficiaryId: params.beneficiaryId,
        beneficiaryName,
        title: params.item.title,
        dueDate: params.item.dueDate,
        responsible: params.item.responsible,
        status: params.item.status,
        overdueByDays: Math.abs(diffDays),
      },
    });
    return;
  }

  if (diffDays <= ACTION_ITEM_DUE_SOON_THRESHOLD_DAYS) {
    const cache = params.cache ?? new Map<string, string | null>();
    const beneficiaryName = await getBeneficiaryDisplayName({
      beneficiaryId: params.beneficiaryId,
      explicitName: params.beneficiaryName,
      cache,
    });

    publishNotificationEvent({
      type: 'action_item.due_soon',
      data: {
        actionPlanId: params.actionPlanId,
        actionItemId: params.item.id,
        beneficiaryId: params.beneficiaryId,
        beneficiaryName,
        title: params.item.title,
        dueDate: params.item.dueDate,
        responsible: params.item.responsible,
        status: params.item.status,
        dueInDays: diffDays,
      },
    });
  }
}

let reminderInterval: NodeJS.Timeout | null = null;

export async function createActionPlan(params: {
  beneficiaryId: string;
  status?: string;
  userId?: string | null;
}): Promise<ActionPlanRecord> {
  const plan = await createActionPlanRepository({
    beneficiaryId: params.beneficiaryId,
    status: params.status,
    createdBy: params.userId ?? null,
  });

  await recordAuditLog({
    userId: params.userId ?? null,
    entity: 'action_plan',
    entityId: plan.id,
    action: 'create',
    beforeData: null,
    afterData: plan,
  });

  return plan;
}

export async function updateActionPlan(id: string, params: {
  status?: string;
  userId?: string | null;
}): Promise<ActionPlanRecord> {
  if (!params.status) {
    throw new AppError('Nothing to update', 400);
  }

  const before = await getActionPlan(id);
  if (!before) {
    throw new AppError('Action plan not found', 404);
  }

  const plan = await updateActionPlanRepository(id, { status: params.status });

  await recordAuditLog({
    userId: params.userId ?? null,
    entity: 'action_plan',
    entityId: plan.id,
    action: 'update',
    beforeData: before,
    afterData: plan,
  });

  return plan;
}

export async function getActionPlanOrFail(id: string): Promise<ActionPlanRecord> {
  const plan = await getActionPlan(id);
  if (!plan) {
    throw new AppError('Action plan not found', 404);
  }
  return plan;
}

export async function listActionPlansForBeneficiary(params: {
  beneficiaryId: string;
  status?: string;
}): Promise<ActionPlanRecord[]> {
  return listActionPlans(params);
}

export async function addActionItem(params: {
  actionPlanId: string;
  title: string;
  responsible?: string | null;
  dueDate?: string | null;
  status?: string;
  support?: string | null;
  notes?: string | null;
  userId?: string | null;
}): Promise<ActionPlanRecord> {
  const dueDate = params.dueDate ? new Date(params.dueDate) : null;
  if (dueDate && Number.isNaN(dueDate.getTime())) {
    throw new AppError('Invalid dueDate', 400);
  }

  const plan = await createActionItemRepository({
    actionPlanId: params.actionPlanId,
    title: params.title,
    responsible: params.responsible ?? null,
    dueDate,
    status: params.status,
    support: params.support ?? null,
    notes: params.notes ?? null,
  });

  await recordAuditLog({
    userId: params.userId ?? null,
    entity: 'action_plan',
    entityId: plan.id,
    action: 'add_item',
    beforeData: null,
    afterData: plan,
  });

  const createdItem = plan.items[plan.items.length - 1];
  if (createdItem) {
    await evaluateAndPublishActionItemReminder({
      actionPlanId: plan.id,
      beneficiaryId: plan.beneficiaryId,
      item: createdItem,
    });
  }

  return plan;
}

export async function updateActionItem(params: {
  actionPlanId: string;
  itemId: string;
  title?: string;
  responsible?: string | null;
  dueDate?: string | null;
  status?: string;
  support?: string | null;
  notes?: string | null;
  completedAt?: string | null;
  userId?: string | null;
}): Promise<ActionPlanRecord> {
  const dueDateProvided = Object.prototype.hasOwnProperty.call(params, 'dueDate');
  let dueDate: Date | null = null;
  if (dueDateProvided) {
    if (params.dueDate === null) {
      dueDate = null;
    } else {
      const parsedDueDate = new Date(params.dueDate);
      if (Number.isNaN(parsedDueDate.getTime())) {
        throw new AppError('Invalid dueDate', 400);
      }
      dueDate = parsedDueDate;
    }
  }

  let completedAt: Date | null | undefined;
  if (params.completedAt !== undefined) {
    if (params.completedAt === null) {
      completedAt = null;
    } else {
      const parsedCompletedAt = new Date(params.completedAt);
      if (Number.isNaN(parsedCompletedAt.getTime())) {
        throw new AppError('Invalid completedAt', 400);
      }
      completedAt = parsedCompletedAt;
    }
  }

  const itemBefore = await getActionItemById(params.itemId);
  if (!itemBefore) {
    throw new AppError('Action item not found', 404);
  }

  const repositoryPayload: Parameters<typeof updateActionItemRepository>[0] = {
    actionPlanId: params.actionPlanId,
    itemId: params.itemId,
  };

  if (params.title !== undefined) {
    repositoryPayload.title = params.title;
  }

  if (params.responsible !== undefined) {
    repositoryPayload.responsible = params.responsible;
  }

  if (dueDateProvided) {
    repositoryPayload.dueDate = dueDate;
  }

  if (params.status !== undefined) {
    repositoryPayload.status = params.status;
  }

  if (params.support !== undefined) {
    repositoryPayload.support = params.support;
  }

  if (params.notes !== undefined) {
    repositoryPayload.notes = params.notes;
  }

  if (completedAt !== undefined) {
    repositoryPayload.completedAt = completedAt;
  }

  const plan = await updateActionItemRepository(repositoryPayload);

  const updatedItem = plan.items.find((item) => item.id === params.itemId) ?? null;

  await recordAuditLog({
    userId: params.userId ?? null,
    entity: 'action_plan',
    entityId: plan.id,
    action: 'update_item',
    beforeData: itemBefore,
    afterData: updatedItem,
  });

  if (updatedItem) {
    await evaluateAndPublishActionItemReminder({
      actionPlanId: plan.id,
      beneficiaryId: plan.beneficiaryId,
      item: updatedItem,
    });
  }

  return plan;
}

export async function listActionItemsSummary(params: {
  beneficiaryId: string;
  status?: string;
  dueBefore?: string;
}): Promise<ActionItemRecord[]> {
  const dueBefore = params.dueBefore ? new Date(params.dueBefore) : undefined;

  return listActionItemsForBeneficiary({
    beneficiaryId: params.beneficiaryId,
    status: params.status,
    dueBefore: dueBefore && !Number.isNaN(dueBefore.getTime()) ? dueBefore : undefined,
  });
}

export async function runActionItemReminderScan(now: Date = new Date()): Promise<void> {
  const referenceDate = startOfUtcDay(now);
  const maxDueDate = new Date(referenceDate.getTime() + ACTION_ITEM_DUE_SOON_THRESHOLD_DAYS * MS_PER_DAY);
  const cache: BeneficiaryNameCache = new Map();

  const items = await listActionItemsDueBefore({ maxDueDate });

  for (const item of items) {
    await evaluateAndPublishActionItemReminder({
      actionPlanId: item.actionPlanId,
      beneficiaryId: item.beneficiaryId,
      beneficiaryName: item.beneficiaryName,
      item,
      now,
      cache,
    });
  }
}

export function startActionItemReminderJob(options?: { intervalMs?: number; nowProvider?: () => Date }): void {
  const intervalMs = options?.intervalMs && options.intervalMs > 0
    ? options.intervalMs
    : ACTION_ITEM_REMINDER_INTERVAL_MS;
  const nowProvider = options?.nowProvider ?? (() => new Date());

  const execute = async () => {
    try {
      await runActionItemReminderScan(nowProvider());
    } catch (error) {
      logger.error({ err: error }, 'Action item reminder scan failed');
    }
  };

  if (reminderInterval) {
    clearInterval(reminderInterval);
  }

  void execute();
  reminderInterval = setInterval(() => {
    void execute();
  }, intervalMs);
}

export function stopActionItemReminderJob(): void {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
  }
}
