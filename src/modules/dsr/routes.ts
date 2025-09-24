import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../shared/errors';
import { beneficiaryIdParamSchema } from '../beneficiaries/schemas';
import { exportBeneficiaryData } from './service';

const EXPORT_REQUIREMENTS = {
  roles: ['admin', 'coordenacao', 'tecnica'],
  permissions: ['beneficiaries:read', 'consents:read'],
  strategy: 'all',
} as const;

export const dsrRoutes: FastifyPluginAsync = async (app) => {
  app.get('/dsr/beneficiaries/:id/export', {
    preHandler: [app.authenticate, app.authorize(EXPORT_REQUIREMENTS)],
  }, async (request) => {
    const params = beneficiaryIdParamSchema.safeParse(request.params);
    if (!params.success) {
      throw new AppError('Invalid params', 400, params.error.flatten());
    }

    const result = await exportBeneficiaryData(params.data.id, request.user?.sub ?? null);
    return result;
  });
};
