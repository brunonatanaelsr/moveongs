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

const READ_ROLES = ['admin', 'coordenacao', 'tecnica', 'educadora', 'recepcao', 'financeiro'];
const WRITE_ROLES = ['admin', 'coordenacao', 'tecnica', 'recepcao'];

export const beneficiaryRoutes: FastifyPluginAsync = async (app) => {
  app.get('/beneficiaries', {
    preHandler: [app.authenticate, app.authorize(READ_ROLES)],
  }, async (request) => {
    const parsedQuery = listBeneficiaryQuerySchema.safeParse(request.query);

    if (!parsedQuery.success) {
      throw new AppError('Invalid query', 400, parsedQuery.error.flatten());
    }

    const data = await listBeneficiarySummaries(parsedQuery.data);

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
    preHandler: [app.authenticate, app.authorize(WRITE_ROLES)],
  }, async (request, reply) => {
    const parsedBody = createBeneficiaryBodySchema.safeParse(request.body);

    if (!parsedBody.success) {
      throw new AppError('Invalid body', 400, parsedBody.error.flatten());
    }

    const record = await createBeneficiary(parsedBody.data);
    return reply.code(201).send({ beneficiary: record });
  });

  app.get('/beneficiaries/:id', {
    preHandler: [app.authenticate, app.authorize(READ_ROLES)],
  }, async (request) => {
    const parsedParams = beneficiaryIdParamSchema.safeParse(request.params);

    if (!parsedParams.success) {
      throw new AppError('Invalid params', 400, parsedParams.error.flatten());
    }

    const record = await getBeneficiary(parsedParams.data.id);
    return { beneficiary: record };
  });

  app.patch('/beneficiaries/:id', {
    preHandler: [app.authenticate, app.authorize(WRITE_ROLES)],
  }, async (request) => {
    const parsedParams = beneficiaryIdParamSchema.safeParse(request.params);

    if (!parsedParams.success) {
      throw new AppError('Invalid params', 400, parsedParams.error.flatten());
    }

    const parsedBody = updateBeneficiaryBodySchema.safeParse(request.body);

    if (!parsedBody.success) {
      throw new AppError('Invalid body', 400, parsedBody.error.flatten());
    }

    const record = await updateBeneficiary(parsedParams.data.id, parsedBody.data);
    return { beneficiary: record };
  });
};
