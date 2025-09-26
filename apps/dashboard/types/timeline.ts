export type EvolutionTimelineEntry = {
  id: string;
  beneficiaryId: string;
  kind: 'evolution';
  date: string;
  title: string;
  description: string | null;
  status: null;
  metadata: {
    responsible: string | null;
    requiresSignature: boolean;
  };
};

export type ActionItemTimelineEntry = {
  id: string;
  beneficiaryId: string;
  kind: 'action_item';
  date: string;
  title: string;
  description: string | null;
  status: string | null;
  metadata: {
    responsible: string | null;
    support: string | null;
    notes: string | null;
    dueDate: string | null;
    completedAt: string | null;
    actionPlanId: string | null;
    originalStatus?: string | null;
    isOverdue?: boolean;
    isCompleted?: boolean;
  };
};

export type SystemAlertTimelineEntry = {
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
    items: Array<{ id: string; title: string; dueDate: string | null; actionPlanId: string | null }>;
    generatedAt: string;
  };
};

export type TimelineEvent = EvolutionTimelineEntry | ActionItemTimelineEntry | SystemAlertTimelineEntry;
