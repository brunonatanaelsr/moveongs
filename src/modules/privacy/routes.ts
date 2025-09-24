import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../shared/errors';
import { getDataSubjectRequestDetails, requestDataSubjectExport } from './service';

const createDsrBodySchema = z.object({
  beneficiaryId: z.string().uuid(),
});

const dsrIdParamSchema = z.object({
  id: z.string().uuid(),
});

const DSR_ACCESS_REQUIREMENTS = {
  roles: ['admin', 'coordenacao'],
  permissions: ['beneficiaries:read', 'consents:read'],
} as const;

export const privacyRoutes: FastifyPluginAsync = async (app) => {
  app.post('/privacy/dsr', {
    preHandler: [app.authenticate, app.authorize(DSR_ACCESS_REQUIREMENTS)],
  }, async (request, reply) => {
    const parsed = createDsrBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError('Invalid request', 400, parsed.error.flatten());
    }

    const result = await requestDataSubjectExport({
      beneficiaryId: parsed.data.beneficiaryId,
      requestedBy: request.user.sub,
    });

    return reply.code(201).send(result);
  });

  app.get('/privacy/dsr/:id', {
    preHandler: [app.authenticate, app.authorize(DSR_ACCESS_REQUIREMENTS)],
  }, async (request) => {
    const params = dsrIdParamSchema.safeParse(request.params);
    if (!params.success) {
      throw new AppError('Invalid request', 400, params.error.flatten());
    }

    const details = await getDataSubjectRequestDetails(params.data.id);
    return details;
  });

  app.get('/privacy/dsr/:id/export', {
    preHandler: [app.authenticate, app.authorize(DSR_ACCESS_REQUIREMENTS)],
  }, async (request) => {
    const params = dsrIdParamSchema.safeParse(request.params);
    if (!params.success) {
      throw new AppError('Invalid request', 400, params.error.flatten());
    }

    const details = await getDataSubjectRequestDetails(params.data.id);

    if (!details.export) {
      throw new AppError('Export not available', 404);
    }

    return { export: details.export };
  });
};
