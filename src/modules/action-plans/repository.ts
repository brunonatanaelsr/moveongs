import { query, withTransaction } from '../../db';
import { AppError, NotFoundError } from '../../shared/errors';

export type ActionItemRecord = {
  id: string;
  actionPlanId: string;
  title: string;
  responsible: string | null;
  dueDate: string | null;
  status: string;
  support: string | null;
  notes: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ActionPlanRecord = {
  id: string;
  beneficiaryId: string;
  status: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  items: ActionItemRecord[];
};

export type ActionItemReminderRecord = ActionItemRecord & {
  beneficiaryId: string;
  beneficiaryName: string | null;
};

function mapActionPlan(row: any, items: ActionItemRecord[] = []): ActionPlanRecord {
  return {
    id: row.id,
    beneficiaryId: row.beneficiary_id,
    status: row.status,
    createdBy: row.created_by ?? null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    items,
  };
}

function toIso(value: any): string {
  if (!value) {
    return new Date().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

function mapActionItem(row: any): ActionItemRecord {
  const dueDate = row.due_date ? new Date(row.due_date) : null;
  const completedAt = row.completed_at ? new Date(row.completed_at) : null;
  return {
    id: row.id,
    actionPlanId: row.action_plan_id,
    title: row.title,
    responsible: row.responsible ?? null,
    dueDate: dueDate ? dueDate.toISOString().slice(0, 10) : null,
    status: row.status,
    support: row.support ?? null,
    notes: row.notes ?? null,
    completedAt: completedAt ? completedAt.toISOString() : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

async function fetchPlanWithItems(id: string, client?: import('pg').PoolClient) {
  const { rows } = client
    ? await client.query('select * from action_plans where id = $1', [id])
    : await query('select * from action_plans where id = $1', [id]);
  if (rows.length === 0) {
    return null;
  }

  const planRow = rows[0];
  const items = await fetchItemsByPlanIds([id], client);
  return mapActionPlan(planRow, items.get(id) ?? []);
}

async function fetchItemsByPlanIds(planIds: string[], client?: import('pg').PoolClient): Promise<Map<string, ActionItemRecord[]>> {
  if (planIds.length === 0) {
    return new Map();
  }

  const placeholders = planIds.map((_, index) => `$${index + 1}`).join(',');
  const sql = `select * from action_items
      where action_plan_id in (${placeholders})
      order by created_at asc`;

  const { rows } = client ? await client.query(sql, planIds) : await query(sql, planIds);

  const map = new Map<string, ActionItemRecord[]>();

  for (const row of rows) {
    const item = mapActionItem(row);
    if (!map.has(item.actionPlanId)) {
      map.set(item.actionPlanId, []);
    }
    map.get(item.actionPlanId)!.push(item);
  }

  return map;
}

export async function createActionPlan(params: {
  beneficiaryId: string;
  status?: string;
  createdBy?: string | null;
}): Promise<ActionPlanRecord> {
  const planId = await withTransaction(async (client) => {
    const beneficiary = await client.query('select id from beneficiaries where id = $1', [
      params.beneficiaryId,
    ]);
    if (beneficiary.rowCount === 0) {
      throw new AppError('Beneficiary not found', 404);
    }

    const { rows } = await client.query(
      `insert into action_plans (beneficiary_id, status, created_by)
       values ($1, coalesce($2, 'active'), $3)
       returning id`,
      [params.beneficiaryId, params.status ?? null, params.createdBy ?? null],
    );

    return rows[0].id as string;
  });

  const plan = await fetchPlanWithItems(planId);
  if (!plan) {
    throw new AppError('Failed to load action plan after creation', 500);
  }

  return plan;
}

export async function updateActionPlan(id: string, params: {
  status?: string;
}): Promise<ActionPlanRecord> {
  await withTransaction(async (client) => {
    const existing = await client.query('select id from action_plans where id = $1', [id]);
    if (existing.rowCount === 0) {
      throw new NotFoundError('Action plan not found');
    }

    await client.query(
      `update action_plans set
         status = coalesce($2, status),
         updated_at = now()
       where id = $1`,
      [id, params.status ?? null],
    );
  });

  const plan = await fetchPlanWithItems(id);
  if (!plan) {
    throw new AppError('Failed to load action plan after update', 500);
  }
  return plan;
}

export async function getActionPlan(id: string): Promise<ActionPlanRecord | null> {
  return fetchPlanWithItems(id);
}

export async function listActionPlans(params: {
  beneficiaryId: string;
  status?: string;
}): Promise<ActionPlanRecord[]> {
  const values: unknown[] = [params.beneficiaryId];
  const filters: string[] = ['beneficiary_id = $1'];

  if (params.status) {
    values.push(params.status);
    filters.push(`status = $${values.length}`);
  }

  const { rows } = await query(
    `select * from action_plans
      where ${filters.join(' and ')}
      order by created_at desc`,
    values,
  );

  if (rows.length === 0) {
    return [];
  }

  const planIds = rows.map((row) => row.id as string);
  const itemsMap = await fetchItemsByPlanIds(planIds);

  return rows.map((row) => mapActionPlan(row, itemsMap.get(row.id) ?? []));
}

export async function createActionItem(params: {
  actionPlanId: string;
  title: string;
  responsible?: string | null;
  dueDate?: Date | null;
  status?: string;
  support?: string | null;
  notes?: string | null;
}): Promise<ActionPlanRecord> {
  await withTransaction(async (client) => {
    const plan = await client.query('select id from action_plans where id = $1', [params.actionPlanId]);
    if (plan.rowCount === 0) {
      throw new NotFoundError('Action plan not found');
    }

    await client.query(
      `insert into action_items (
         action_plan_id,
         title,
         responsible,
         due_date,
         status,
         support,
         notes
       ) values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        params.actionPlanId,
        params.title,
        params.responsible ?? null,
        params.dueDate ?? null,
        params.status ?? 'pending',
        params.support ?? null,
        params.notes ?? null,
      ],
    );
  });

  const refreshed = await fetchPlanWithItems(params.actionPlanId);
  if (!refreshed) {
    throw new AppError('Failed to load action plan after adding item', 500);
  }

  return refreshed;
}

export async function updateActionItem(params: {
  actionPlanId: string;
  itemId: string;
  title?: string;
  responsible?: string | null;
  dueDate?: Date | null;
  status?: string;
  support?: string | null;
  notes?: string | null;
  completedAt?: Date | null;
}): Promise<ActionPlanRecord> {
  await withTransaction(async (client) => {
    const existing = await client.query(
      'select id from action_items where id = $1 and action_plan_id = $2',
      [params.itemId, params.actionPlanId],
    );

    if (existing.rowCount === 0) {
      throw new NotFoundError('Action item not found');
    }

    const values: unknown[] = [params.itemId, params.actionPlanId];
    const setClauses: string[] = ['updated_at = now()'];

    const pushField = (field: string, value: unknown) => {
      values.push(value);
      setClauses.push(`${field} = $${values.length}`);
    };

    if (params.title !== undefined) {
      pushField('title', params.title ?? null);
    }

    if (params.responsible !== undefined) {
      pushField('responsible', params.responsible);
    }

    if (Object.prototype.hasOwnProperty.call(params, 'dueDate')) {
      pushField('due_date', params.dueDate);
    }

    if (params.status !== undefined) {
      pushField('status', params.status ?? null);
    }

    if (params.support !== undefined) {
      pushField('support', params.support);
    }

    if (params.notes !== undefined) {
      pushField('notes', params.notes);
    }

    if (params.completedAt !== undefined) {
      pushField('completed_at', params.completedAt);
    }

    const sql = `update action_items set ${setClauses.join(', ')} where id = $1 and action_plan_id = $2`;

    await client.query(sql, values);
  });

  const refreshed = await fetchPlanWithItems(params.actionPlanId);
  if (!refreshed) {
    throw new AppError('Failed to load action plan after updating item', 500);
  }

  return refreshed;
}

export async function getActionItemById(id: string): Promise<ActionItemRecord | null> {
  const { rows } = await query('select * from action_items where id = $1', [id]);
  if (rows.length === 0) {
    return null;
  }
  return mapActionItem(rows[0]);
}

export async function listActionItemsForBeneficiary(params: {
  beneficiaryId: string;
  status?: string;
  dueBefore?: Date;
}): Promise<ActionItemRecord[]> {
  const values: unknown[] = [params.beneficiaryId];
  const filters: string[] = ['ap.beneficiary_id = $1'];

  if (params.status) {
    values.push(params.status);
    filters.push(`ai.status = $${values.length}`);
  }

  if (params.dueBefore) {
    values.push(params.dueBefore);
    filters.push(`ai.due_date <= $${values.length}`);
  }

  const { rows } = await query(
    `select ai.*
       from action_items ai
       join action_plans ap on ap.id = ai.action_plan_id
      where ${filters.join(' and ')}
      order by coalesce(ai.due_date, current_date) asc`
    , values,
  );

  return rows.map(mapActionItem);
}

export async function listActionItemsDueBefore(params: { maxDueDate: Date }): Promise<ActionItemReminderRecord[]> {
  const threshold = new Date(Date.UTC(
    params.maxDueDate.getUTCFullYear(),
    params.maxDueDate.getUTCMonth(),
    params.maxDueDate.getUTCDate(),
  ));

  const thresholdDate = threshold.toISOString().slice(0, 10);

  const { rows } = await query<{
    beneficiary_id: string;
    beneficiary_name: string | null;
  } & Record<string, unknown>>(
    `select ai.*, ap.beneficiary_id, b.full_name as beneficiary_name
       from action_items ai
       join action_plans ap on ap.id = ai.action_plan_id
       left join beneficiaries b on b.id = ap.beneficiary_id
      where ai.due_date is not null
        and ai.completed_at is null
        and lower(coalesce(ai.status, '')) <> 'done'
        and ai.due_date <= $1::date
      order by ai.due_date asc`,
    [thresholdDate],
  );

  return rows.map((row) => {
    const item = mapActionItem(row);
    return {
      ...item,
      beneficiaryId: row.beneficiary_id,
      beneficiaryName: row.beneficiary_name ?? null,
    } satisfies ActionItemReminderRecord;
  });
}

export async function getBeneficiaryNameById(beneficiaryId: string): Promise<string | null> {
  const { rows } = await query<{ full_name: string | null }>(
    'select full_name from beneficiaries where id = $1',
    [beneficiaryId],
  );

  if (rows.length === 0) {
    return null;
  }

  return rows[0].full_name ?? null;
}
