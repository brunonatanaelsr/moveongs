import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../shared/errors';
import { recordAuditLog } from '../../shared/audit';
import { beneficiaryIdParamSchema } from '../beneficiaries/schemas';
import {
  createEvolution,
  getEvolutionOrFail,
  listEvolutions,
  updateEvolution,
} from './service';
import {
  createEvolutionBodySchema,
  evolutionIdParamSchema,
  listEvolutionQuerySchema,
} from './schemas';

const READ_REQUIREMENTS = {
  roles: ['admin', 'coordenacao', 'tecnica', 'educadora', 'recepcao', 'financeiro', 'voluntaria', 'leitura_externa'],
  permissions: ['evolutions:read'],
} as const;

const CREATE_REQUIREMENTS = {
  roles: ['admin', 'coordenacao', 'tecnica', 'recepcao', 'educadora'],
  permissions: ['evolutions:create'],
} as const;

const UPDATE_REQUIREMENTS = {
  roles: ['admin', 'coordenacao', 'tecnica'],
  permissions: ['evolutions:create'],
} as const;

export const evolutionRoutes: FastifyPluginAsync = async (app) => {
  app.get('/beneficiaries/:id/evolutions', {
    preHandler: [app.authenticate, app.authorize(READ_REQUIREMENTS)],
  }, async (request) => {
    const params = beneficiaryIdParamSchema.safeParse(request.params);
    if (!params.success) {
      throw new AppError('Invalid params', 400, params.error.flatten());
    }

    const query = listEvolutionQuerySchema.safeParse(request.query);
    if (!query.success) {
      throw new AppError('Invalid query', 400, query.error.flatten());
    }

    const evolutions = await listEvolutions({
      beneficiaryId: params.data.id,
      from: query.data.from,
      to: query.data.to,
      limit: query.data.limit,
      offset: query.data.offset,
    });

    return {
      data: evolutions,
      meta: {
        limit: query.data.limit ?? 50,
        offset: query.data.offset ?? 0,
        count: evolutions.length,
      },
    };
  });

  app.post('/beneficiaries/:id/evolutions', {
    preHandler: [app.authenticate, app.authorize(CREATE_REQUIREMENTS)],
  }, async (request, reply) => {
    const params = beneficiaryIdParamSchema.safeParse(request.params);
    if (!params.success) {
      throw new AppError('Invalid params', 400, params.error.flatten());
    }

    const body = createEvolutionBodySchema.safeParse(request.body);
    if (!body.success) {
      throw new AppError('Invalid body', 400, body.error.flatten());
    }

    const evolution = await createEvolution({
      beneficiaryId: params.data.id,
      date: body.data.date,
      description: body.data.description,
      category: body.data.category ?? null,
      responsible: body.data.responsible ?? null,
      requiresSignature: body.data.requiresSignature ?? false,
      userId: request.user?.sub ?? null,
    });

    return reply.code(201).send({ evolution });
  });

  app.get('/evolutions/:id', {
    preHandler: [app.authenticate, app.authorize(READ_REQUIREMENTS)],
  }, async (request) => {
    const params = evolutionIdParamSchema.safeParse(request.params);
    if (!params.success) {
      throw new AppError('Invalid params', 400, params.error.flatten());
    }

    const evolution = await getEvolutionOrFail(params.data.id);
    return { evolution };
  });

  app.patch('/evolutions/:id', {
    preHandler: [app.authenticate, app.authorize(UPDATE_REQUIREMENTS)],
  }, async (request) => {
    const params = evolutionIdParamSchema.safeParse(request.params);
    if (!params.success) {
      throw new AppError('Invalid params', 400, params.error.flatten());
    }

    const body = createEvolutionBodySchema.partial().safeParse(request.body);
    if (!body.success) {
      throw new AppError('Invalid body', 400, body.error.flatten());
    }

    const evolution = await updateEvolution(params.data.id, {
      description: body.data.description,
      category: body.data.category ?? null,
      responsible: body.data.responsible ?? null,
      requiresSignature: body.data.requiresSignature,
      userId: request.user?.sub ?? null,
    });

    return { evolution };
  });
};
