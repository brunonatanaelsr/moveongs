import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../shared/errors';
import { beneficiaryIdParamSchema } from '../beneficiaries/schemas';
import {
  actionItemIdParamSchema,
  actionItemsSummaryQuerySchema,
  actionPlanIdParamSchema,
  createActionItemBodySchema,
  createActionPlanBodySchema,
  listActionPlansQuerySchema,
  updateActionItemBodySchema,
  updateActionPlanBodySchema,
} from './schemas';
import {
  addActionItem,
  createActionPlan,
  getActionPlanOrFail,
  listActionItemsSummary,
  listActionPlansForBeneficiary,
  updateActionItem,
  updateActionPlan,
} from './service';

const PLAN_CREATE_REQUIREMENTS = {
  roles: ['admin', 'coordenacao', 'tecnica', 'recepcao'],
  permissions: ['action_plans:create'],
} as const;

const PLAN_READ_REQUIREMENTS = {
  roles: ['admin', 'coordenacao', 'tecnica', 'educadora', 'recepcao', 'financeiro', 'voluntaria', 'leitura_externa'],
  permissions: ['action_plans:read'],
} as const;

const PLAN_UPDATE_REQUIREMENTS = {
  roles: ['admin', 'coordenacao', 'tecnica'],
  permissions: ['action_plans:update'],
} as const;

export const actionPlanRoutes: FastifyPluginAsync = async (app) => {
  app.post('/action-plans', {
    preHandler: [app.authenticate, app.authorize(PLAN_CREATE_REQUIREMENTS)],
  }, async (request, reply) => {
    const body = createActionPlanBodySchema.safeParse(request.body);
    if (!body.success) {
      throw new AppError('Invalid body', 400, body.error.flatten());
    }

    const plan = await createActionPlan({
      beneficiaryId: body.data.beneficiaryId,
      status: body.data.status,
      userId: request.user?.sub ?? null,
    });

    return reply.code(201).send({ plan });
  });

  app.get('/beneficiaries/:id/action-plans', {
    preHandler: [app.authenticate, app.authorize(PLAN_READ_REQUIREMENTS)],
  }, async (request) => {
    const params = beneficiaryIdParamSchema.safeParse(request.params);
    if (!params.success) {
      throw new AppError('Invalid params', 400, params.error.flatten());
    }

    const query = listActionPlansQuerySchema.safeParse(request.query);
    if (!query.success) {
      throw new AppError('Invalid query', 400, query.error.flatten());
    }

    const plans = await listActionPlansForBeneficiary({
      beneficiaryId: params.data.id,
      status: query.data.status,
    });

    return { data: plans };
  });

  app.get('/action-plans/:id', {
    preHandler: [app.authenticate, app.authorize(PLAN_READ_REQUIREMENTS)],
  }, async (request) => {
    const params = actionPlanIdParamSchema.safeParse(request.params);
    if (!params.success) {
      throw new AppError('Invalid params', 400, params.error.flatten());
    }

    const plan = await getActionPlanOrFail(params.data.id);
    return { plan };
  });

  app.patch('/action-plans/:id', {
    preHandler: [app.authenticate, app.authorize(PLAN_UPDATE_REQUIREMENTS)],
  }, async (request) => {
    const params = actionPlanIdParamSchema.safeParse(request.params);
    if (!params.success) {
      throw new AppError('Invalid params', 400, params.error.flatten());
    }

    const body = updateActionPlanBodySchema.safeParse(request.body);
    if (!body.success) {
      throw new AppError('Invalid body', 400, body.error.flatten());
    }

    const plan = await updateActionPlan(params.data.id, {
      status: body.data.status,
      userId: request.user?.sub ?? null,
    });

    return { plan };
  });

  app.post('/action-plans/:id/items', {
    preHandler: [app.authenticate, app.authorize(PLAN_CREATE_REQUIREMENTS)],
  }, async (request, reply) => {
    const params = actionPlanIdParamSchema.safeParse(request.params);
    if (!params.success) {
      throw new AppError('Invalid params', 400, params.error.flatten());
    }

    const body = createActionItemBodySchema.safeParse(request.body);
    if (!body.success) {
      throw new AppError('Invalid body', 400, body.error.flatten());
    }

    const plan = await addActionItem({
      actionPlanId: params.data.id,
      title: body.data.title,
      responsible: body.data.responsible ?? null,
      dueDate: body.data.dueDate ?? null,
      status: body.data.status,
      support: body.data.support ?? null,
      notes: body.data.notes ?? null,
      userId: request.user?.sub ?? null,
    });

    return reply.code(201).send({ plan });
  });

  app.patch('/action-plans/:id/items/:itemId', {
    preHandler: [app.authenticate, app.authorize(PLAN_UPDATE_REQUIREMENTS)],
  }, async (request) => {
    const params = actionPlanIdParamSchema.merge(actionItemIdParamSchema).safeParse(request.params);
    if (!params.success) {
      throw new AppError('Invalid params', 400, params.error.flatten());
    }

    const body = updateActionItemBodySchema.safeParse(request.body);
    if (!body.success) {
      throw new AppError('Invalid body', 400, body.error.flatten());
    }

    const plan = await updateActionItem({
      actionPlanId: params.data.id,
      itemId: params.data.itemId,
      title: body.data.title,
      responsible: body.data.responsible ?? null,
      dueDate: body.data.dueDate ?? null,
      status: body.data.status,
      support: body.data.support ?? null,
      notes: body.data.notes ?? null,
      completedAt: body.data.completedAt ?? null,
      userId: request.user?.sub ?? null,
    });

    return { plan };
  });

  app.get('/beneficiaries/:id/action-items/summary', {
    preHandler: [app.authenticate, app.authorize(PLAN_READ_REQUIREMENTS)],
  }, async (request) => {
    const params = beneficiaryIdParamSchema.safeParse(request.params);
    if (!params.success) {
      throw new AppError('Invalid params', 400, params.error.flatten());
    }

    const query = actionItemsSummaryQuerySchema.safeParse(request.query);
    if (!query.success) {
      throw new AppError('Invalid query', 400, query.error.flatten());
    }

    const items = await listActionItemsSummary({
      beneficiaryId: params.data.id,
      status: query.data.status,
      dueBefore: query.data.dueBefore,
    });

    return { data: items };
  });
};
