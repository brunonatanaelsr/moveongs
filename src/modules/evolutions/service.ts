import { recordAuditLog } from '../../shared/audit';
import { AppError } from '../../shared/errors';
import {
  EvolutionRecord,
  createEvolution as createEvolutionRepository,
  getEvolutionById,
  listEvolutions as listEvolutionsRepository,
  updateEvolution as updateEvolutionRepository,
} from './repository';

export async function createEvolution(params: {
  beneficiaryId: string;
  date: string;
  description: string;
  category?: string | null;
  responsible?: string | null;
  requiresSignature?: boolean;
  userId?: string | null;
}): Promise<EvolutionRecord> {
  const date = new Date(params.date);
  if (Number.isNaN(date.getTime())) {
    throw new AppError('Invalid date', 400);
  }

  const evolution = await createEvolutionRepository({
    beneficiaryId: params.beneficiaryId,
    date,
    description: params.description,
    category: params.category ?? null,
    responsible: params.responsible ?? null,
    requiresSignature: params.requiresSignature ?? false,
    createdBy: params.userId ?? null,
  });

  await recordAuditLog({
    userId: params.userId ?? null,
    entity: 'evolution',
    entityId: evolution.id,
    action: 'create',
    beforeData: null,
    afterData: evolution,
  });

  return evolution;
}

export async function listEvolutions(params: {
  beneficiaryId: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<EvolutionRecord[]> {
  const from = params.from ? new Date(params.from) : undefined;
  const to = params.to ? new Date(params.to) : undefined;

  return listEvolutionsRepository({
    beneficiaryId: params.beneficiaryId,
    from: from && !Number.isNaN(from.getTime()) ? from : undefined,
    to: to && !Number.isNaN(to.getTime()) ? to : undefined,
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
  });
}

export async function getEvolutionOrFail(id: string): Promise<EvolutionRecord> {
  const evolution = await getEvolutionById(id);
  if (!evolution) {
    throw new AppError('Evolution not found', 404);
  }
  return evolution;
}

export async function updateEvolution(id: string, params: {
  description?: string;
  category?: string | null;
  responsible?: string | null;
  requiresSignature?: boolean;
  userId?: string | null;
}): Promise<EvolutionRecord> {
  const before = await getEvolutionOrFail(id);

  const updated = await updateEvolutionRepository(id, {
    description: params.description,
    category: params.category,
    responsible: params.responsible,
    requiresSignature: params.requiresSignature,
  });

  await recordAuditLog({
    userId: params.userId ?? null,
    entity: 'evolution',
    entityId: id,
    action: 'update',
    beforeData: before,
    afterData: updated,
  });

  return updated;
}
