import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../shared/errors';
import {
  beneficiaryIdParamSchema,
  createBeneficiaryBodySchema,
  listBeneficiaryQuerySchema,
  updateBeneficiaryBodySchema,
} from './schemas';
import {
  createBeneficiary,
  getBeneficiary,
  listBeneficiarySummaries,
  updateBeneficiary,
} from './service';
import { recordAuditLog } from '../../shared/audit';

const READ_ROLES = ['admin', 'coordenacao', 'tecnica', 'educadora', 'recepcao', 'financeiro'];
const WRITE_ROLES = ['admin', 'coordenacao', 'tecnica', 'recepcao'];
const READ_REQUIREMENTS = { roles: READ_ROLES, permissions: ['beneficiaries:read', 'beneficiaries:read:own'] };
const WRITE_REQUIREMENTS = { roles: WRITE_ROLES, permissions: ['beneficiaries:create'] };
const UPDATE_REQUIREMENTS = { roles: WRITE_ROLES, permissions: ['beneficiaries:update'] };

export const beneficiaryRoutes: FastifyPluginAsync = async (app) => {
  app.get('/beneficiaries', {
    preHandler: [app.authenticate, app.authorize(READ_REQUIREMENTS)],
  }, async (request) => {
    const parsedQuery = listBeneficiaryQuerySchema.safeParse(request.query);

    if (!parsedQuery.success) {
      throw new AppError('Invalid query', 400, parsedQuery.error.flatten());
    }

    const allowedProjectIds = request.user.projectScopes && request.user.projectScopes.length > 0
      ? request.user.projectScopes
      : null;

    const data = await listBeneficiarySummaries({
      ...parsedQuery.data,
      allowedProjectIds,
    });

    return {
      data,
      meta: {
        limit: parsedQuery.data.limit ?? 25,
        offset: parsedQuery.data.offset ?? 0,
        count: data.length,
      },
    };
  });

  app.post('/beneficiaries', {
    preHandler: [app.authenticate, app.authorize(WRITE_REQUIREMENTS)],
  }, async (request, reply) => {
    const parsedBody = createBeneficiaryBodySchema.safeParse(request.body);

    if (!parsedBody.success) {
      throw new AppError('Invalid body', 400, parsedBody.error.flatten());
    }

    const record = await createBeneficiary(parsedBody.data);

    await recordAuditLog({
      userId: request.user?.sub ?? null,
      entity: 'beneficiary',
      entityId: record.id,
      action: 'create',
      beforeData: null,
      afterData: record,
    });

    return reply.code(201).send({ beneficiary: record });
  });

  app.get('/beneficiaries/:id', {
    preHandler: [app.authenticate, app.authorize(READ_REQUIREMENTS)],
  }, async (request) => {
    const parsedParams = beneficiaryIdParamSchema.safeParse(request.params);

    if (!parsedParams.success) {
      throw new AppError('Invalid params', 400, parsedParams.error.flatten());
    }

    const allowedProjectIds = request.user.projectScopes && request.user.projectScopes.length > 0
      ? request.user.projectScopes
      : null;

    const record = await getBeneficiary(parsedParams.data.id, allowedProjectIds);
    return { beneficiary: record };
  });

  app.patch('/beneficiaries/:id', {
    preHandler: [app.authenticate, app.authorize(UPDATE_REQUIREMENTS)],
  }, async (request) => {
    const parsedParams = beneficiaryIdParamSchema.safeParse(request.params);

    if (!parsedParams.success) {
      throw new AppError('Invalid params', 400, parsedParams.error.flatten());
    }

    const parsedBody = updateBeneficiaryBodySchema.safeParse(request.body);

    if (!parsedBody.success) {
      throw new AppError('Invalid body', 400, parsedBody.error.flatten());
    }

    const allowedProjectIds = request.user.projectScopes && request.user.projectScopes.length > 0
      ? request.user.projectScopes
      : null;

    const before = await getBeneficiary(parsedParams.data.id, allowedProjectIds);
    const record = await updateBeneficiary(parsedParams.data.id, parsedBody.data, allowedProjectIds);

    await recordAuditLog({
      userId: request.user?.sub ?? null,
      entity: 'beneficiary',
      entityId: record.id,
      action: 'update',
      beforeData: before,
      afterData: record,
    });

    return { beneficiary: record };
  });
};
