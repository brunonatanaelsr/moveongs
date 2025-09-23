import { query } from '../../db';

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
  };
};

export type TimelineEntry = EvolutionTimelineEntry | ActionItemTimelineEntry;

export async function fetchTimeline(beneficiaryId: string, limit: number, offset: number): Promise<TimelineEntry[]> {
  const { rows } = await query(
    `select * from (
        select e.id,
               e.beneficiary_id,
               'evolution' as kind,
               e.date as event_date,
               coalesce(e.category, 'Evolução') as title,
               e.description as description,
               null::text as status,
               e.responsible,
               e.requires_signature,
               null::text as support,
               null::text as notes,
               null::uuid as action_plan_id,
               null::date as item_due_date,
               null::timestamptz as completed_at
          from evolutions e
         where e.beneficiary_id = $1

        union all

        select ai.id,
               ap.beneficiary_id,
               'action_item' as kind,
               coalesce(ai.due_date, ap.created_at::date) as event_date,
               ai.title,
               ai.notes,
               ai.status,
               ai.responsible,
               false as requires_signature,
               ai.support,
               ai.notes,
               ai.action_plan_id,
               ai.due_date as item_due_date,
               ai.completed_at
          from action_items ai
          join action_plans ap on ap.id = ai.action_plan_id
         where ap.beneficiary_id = $1
      ) timeline
      order by event_date desc nulls last
      limit $2 offset $3`,
    [beneficiaryId, limit, offset],
  );

  return rows.map((row) => {
    const base = {
      id: row.id as string,
      beneficiaryId: row.beneficiary_id as string,
      kind: row.kind as 'evolution' | 'action_item',
      date: row.event_date
        ? new Date(row.event_date).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
      title: row.title as string,
      description: (row.description as string | null) ?? null,
    } as const;

    if (row.kind === 'evolution') {
      return {
        ...base,
        kind: 'evolution' as const,
        status: null,
        metadata: {
          responsible: (row.responsible as string | null) ?? null,
          requiresSignature: (row.requires_signature as boolean | null) ?? false,
        },
      } satisfies EvolutionTimelineEntry;
    }

    return {
      ...base,
      kind: 'action_item' as const,
      status: (row.status as string | null) ?? null,
      metadata: {
        responsible: (row.responsible as string | null) ?? null,
        support: (row.support as string | null) ?? null,
        notes: (row.notes as string | null) ?? null,
        dueDate: row.item_due_date ? new Date(row.item_due_date).toISOString().slice(0, 10) : null,
        completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
        actionPlanId: (row.action_plan_id as string | null) ?? null,
      },
    } satisfies ActionItemTimelineEntry;
  });
}
