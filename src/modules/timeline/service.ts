import {
  fetchTimeline,
  type ActionItemTimelineEntry,
  type EvolutionTimelineEntry,
  type TimelineEntry,
} from './repository';

type ActionItemStatus = 'pending' | 'in_progress' | 'done' | 'blocked' | 'overdue';

type EnhancedActionItemTimelineEntry = Omit<ActionItemTimelineEntry, 'status' | 'metadata'> & {
  kind: 'action_item';
  status: ActionItemStatus;
  metadata: ActionItemTimelineEntry['metadata'] & {
    originalStatus: ActionItemTimelineEntry['status'];
    isOverdue: boolean;
    isCompleted: boolean;
  };
};

type SystemAlertTimelineEntry = {
  id: string;
  beneficiaryId: string;
  kind: 'system_alert';
  date: string;
  title: string;
  description: string | null;
  status: 'alert';
  metadata: {
    alertType: 'action_plan_overdue';
    overdueCount: number;
    itemIds: string[];
    items: Array<{
      id: string;
      title: string;
      dueDate: string | null;
      actionPlanId: string | null;
    }>;
    generatedAt: string;
  };
};

export type TimelineEvent =
  | EvolutionTimelineEntry
  | EnhancedActionItemTimelineEntry
  | SystemAlertTimelineEntry;

function normalizeDate(date: Date): Date {
  const normalized = new Date(date);
  normalized.setUTCHours(0, 0, 0, 0);
  return normalized;
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function enhanceActionItem(
  entry: ActionItemTimelineEntry,
  today: Date,
): EnhancedActionItemTimelineEntry {
  const dueDate = toDate(entry.metadata.dueDate ?? null);
  const completedAt = toDate(entry.metadata.completedAt ?? null);
  const originalStatus = entry.status ?? null;

  const isCompleted = originalStatus === 'done' || Boolean(completedAt);
  const isOverdue = !isCompleted && Boolean(dueDate) && dueDate!.getTime() < today.getTime();

  let computedStatus: ActionItemStatus;
  if (isCompleted) {
    computedStatus = 'done';
  } else if (isOverdue) {
    computedStatus = 'overdue';
  } else if (
    originalStatus === 'pending' ||
    originalStatus === 'in_progress' ||
    originalStatus === 'done' ||
    originalStatus === 'blocked'
  ) {
    computedStatus = originalStatus;
  } else {
    computedStatus = 'pending';
  }

  return {
    ...entry,
    status: computedStatus,
    metadata: {
      ...entry.metadata,
      originalStatus,
      isOverdue,
      isCompleted,
    },
  };
}

function buildOverdueAlert(
  beneficiaryId: string,
  items: EnhancedActionItemTimelineEntry[],
  referenceDate: Date,
): SystemAlertTimelineEntry {
  const dateIso = referenceDate.toISOString().slice(0, 10);
  const generatedAt = new Date().toISOString();

  return {
    id: `overdue-banner-${beneficiaryId}-${dateIso}`,
    beneficiaryId,
    kind: 'system_alert',
    date: dateIso,
    title: 'Atividades do plano de ação em atraso',
    description: `Existem ${items.length} atividades do plano de ação em atraso`,
    status: 'alert',
    metadata: {
      alertType: 'action_plan_overdue',
      overdueCount: items.length,
      itemIds: items.map((item) => item.id),
      items: items.map((item) => ({
        id: item.id,
        title: item.title,
        dueDate: item.metadata.dueDate ?? null,
        actionPlanId: item.metadata.actionPlanId ?? null,
      })),
      generatedAt,
    },
  };
}

function sortTimeline(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => {
    if (a.date === b.date) {
      if (a.id === b.id) {
        return 0;
      }
      return a.id < b.id ? 1 : -1;
    }
    return a.date < b.date ? 1 : -1;
  });
}

export async function listTimelineEntries(params: {
  beneficiaryId: string;
  limit: number;
  offset: number;
}): Promise<TimelineEvent[]> {
  const fetchLimit = Math.max(params.limit + params.offset + 1, params.limit);
  const today = normalizeDate(new Date());

  const baseEntries = await fetchTimeline(params.beneficiaryId, fetchLimit, 0);

  const enhancedEntries: TimelineEvent[] = baseEntries.map((entry: TimelineEntry) => {
    if (entry.kind === 'action_item') {
      return enhanceActionItem(entry, today);
    }
    return entry;
  });

  const overdueItems = enhancedEntries.filter(
    (entry): entry is EnhancedActionItemTimelineEntry =>
      entry.kind === 'action_item' && entry.metadata.isOverdue,
  );

  const alerts: SystemAlertTimelineEntry[] = [];
  if (overdueItems.length > 0) {
    alerts.push(buildOverdueAlert(params.beneficiaryId, overdueItems, today));
  }

  const combined = sortTimeline([...enhancedEntries, ...alerts]);
  return combined.slice(params.offset, params.offset + params.limit);
}
