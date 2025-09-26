import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../shared/errors';
import { beneficiaryIdParamSchema } from '../beneficiaries/schemas';
import { exportBeneficiaryData } from './service';

const EXPORT_REQUIREMENTS = {
  roles: ['admin', 'coordenacao', 'tecnica'],
  permissions: ['beneficiaries:read', 'consents:read'],
  strategy: 'any',
} as const;

export const dsrRoutes: FastifyPluginAsync = async (app) => {
  app.get('/dsr/beneficiaries/:id/export', {
    preHandler: [app.authenticate, app.authorize(EXPORT_REQUIREMENTS)],
  }, async (request) => {
    const params = beneficiaryIdParamSchema.safeParse(request.params);
    if (!params.success) {
      throw new AppError('Invalid params', 400, params.error.flatten());
    }

    const permissions = new Set(request.user?.permissions ?? []);
    const hasRequiredPermissions = ['beneficiaries:read', 'consents:read'].every((permission) =>
      permissions.has(permission),
    );

    if (!hasRequiredPermissions) {
      throw new AppError('Insufficient permissions', 403);
    }

    const result = await exportBeneficiaryData(params.data.id, request.user?.sub ?? null);
    return result;
  });
};
