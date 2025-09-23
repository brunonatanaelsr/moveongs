import { query } from '../../db';

export type TimelineEntry = {
  id: string;
  beneficiaryId: string;
  kind: 'evolution' | 'action_item';
  date: string;
  title: string;
  description: string | null;
  status: string | null;
  metadata: Record<string, unknown>;
};

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
               null::date as item_due_date
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
               ai.due_date as item_due_date
          from action_items ai
          join action_plans ap on ap.id = ai.action_plan_id
         where ap.beneficiary_id = $1
      ) timeline
      order by event_date desc nulls last
      limit $2 offset $3`,
    [beneficiaryId, limit, offset],
  );

  return rows.map((row) => ({
    id: row.id,
    beneficiaryId: row.beneficiary_id,
    kind: row.kind,
    date: row.event_date ? new Date(row.event_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    title: row.title,
    description: row.description ?? null,
    status: row.status ?? null,
    metadata: row.kind === 'evolution'
      ? {
          responsible: row.responsible ?? null,
          requiresSignature: row.requires_signature ?? false,
        }
      : {
          responsible: row.responsible ?? null,
          support: row.support ?? null,
          notes: row.notes ?? null,
          dueDate: row.item_due_date ? new Date(row.item_due_date).toISOString().slice(0, 10) : null,
          actionPlanId: row.action_plan_id ?? null,
        },
  }));
}
