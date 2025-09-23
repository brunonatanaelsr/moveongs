import { query, withTransaction } from '../../db';
import { AppError, NotFoundError } from '../../shared/errors';

export type EvolutionRecord = {
  id: string;
  beneficiaryId: string;
  date: string;
  description: string;
  category: string | null;
  responsible: string | null;
  requiresSignature: boolean;
  createdBy: string | null;
  createdAt: string;
};

function mapEvolution(row: any): EvolutionRecord {
  return {
    id: row.id,
    beneficiaryId: row.beneficiary_id,
    date: row.date.toISOString().slice(0, 10),
    description: row.description,
    category: row.category ?? null,
    responsible: row.responsible ?? null,
    requiresSignature: row.requires_signature ?? false,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listEvolutions(params: {
  beneficiaryId: string;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}): Promise<EvolutionRecord[]> {
  const values: unknown[] = [params.beneficiaryId];
  const filters: string[] = ['beneficiary_id = $1'];

  if (params.from) {
    values.push(params.from);
    filters.push(`date >= $${values.length}`);
  }

  if (params.to) {
    values.push(params.to);
    filters.push(`date <= $${values.length}`);
  }

  values.push(params.limit);
  values.push(params.offset);

  const { rows } = await query(
    `select * from evolutions
      where ${filters.join(' and ')}
      order by date desc, created_at desc
      limit $${values.length - 1} offset $${values.length}`,
    values,
  );

  return rows.map(mapEvolution);
}

export async function getEvolutionById(id: string): Promise<EvolutionRecord | null> {
  const { rows } = await query('select * from evolutions where id = $1', [id]);
  if (rows.length === 0) {
    return null;
  }

  return mapEvolution(rows[0]);
}

export async function createEvolution(params: {
  beneficiaryId: string;
  date: Date;
  description: string;
  category?: string | null;
  responsible?: string | null;
  requiresSignature?: boolean;
  createdBy?: string | null;
}): Promise<EvolutionRecord> {
  return withTransaction(async (client) => {
    const beneficiary = await client.query('select id from beneficiaries where id = $1', [
      params.beneficiaryId,
    ]);

    if (beneficiary.rowCount === 0) {
      throw new AppError('Beneficiary not found', 404);
    }

    const { rows } = await client.query(
      `insert into evolutions (
         beneficiary_id,
         date,
         description,
         category,
         responsible,
         requires_signature,
         created_by
       ) values ($1,$2,$3,$4,$5,$6,$7)
       returning *`,
      [
        params.beneficiaryId,
        params.date,
        params.description,
        params.category ?? null,
        params.responsible ?? null,
        params.requiresSignature ?? false,
        params.createdBy ?? null,
      ],
    );

    return mapEvolution(rows[0]);
  });
}

export async function updateEvolution(id: string, params: {
  description?: string;
  category?: string | null;
  responsible?: string | null;
  requiresSignature?: boolean;
}): Promise<EvolutionRecord> {
  return withTransaction(async (client) => {
    const existing = await client.query('select * from evolutions where id = $1', [id]);
    if (existing.rowCount === 0) {
      throw new NotFoundError('Evolution not found');
    }

    const row = existing.rows[0];

    await client.query(
      `update evolutions set
         description = coalesce($2, description),
         category = $3,
         responsible = $4,
         requires_signature = coalesce($5, requires_signature)
       where id = $1`,
      [
        id,
        params.description ?? null,
        params.category ?? row.category,
        params.responsible ?? row.responsible,
        params.requiresSignature ?? null,
      ],
    );

    const refreshed = await client.query('select * from evolutions where id = $1', [id]);
    return mapEvolution(refreshed.rows[0]);
  });
}
