import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../shared/errors';
import { beneficiaryIdParamSchema } from '../beneficiaries/schemas';
import { listTimelineEntries } from './service';

const TIMELINE_READ_REQUIREMENTS = {
  roles: ['admin', 'coordenacao', 'tecnica', 'educadora', 'recepcao', 'financeiro', 'voluntaria', 'leitura_externa'],
  permissions: ['evolutions:read', 'action_plans:read'],
} as const;

export const timelineRoutes: FastifyPluginAsync = async (app) => {
  app.get('/beneficiaries/:id/timeline', {
    preHandler: [app.authenticate, app.authorize(TIMELINE_READ_REQUIREMENTS)],
  }, async (request) => {
    const params = beneficiaryIdParamSchema.safeParse(request.params);
    if (!params.success) {
      throw new AppError('Invalid params', 400, params.error.flatten());
    }

    const query = request.query as { limit?: string; offset?: string };
    const limit = query?.limit ? Number.parseInt(query.limit, 10) : 50;
    const offset = query?.offset ? Number.parseInt(query.offset, 10) : 0;

    const data = await listTimelineEntries({
      beneficiaryId: params.data.id,
      limit: Number.isFinite(limit) ? Math.min(limit, 200) : 50,
      offset: Number.isFinite(offset) ? offset : 0,
    });

    return {
      data,
      meta: {
        limit: Number.isFinite(limit) ? Math.min(limit, 200) : 50,
        offset: Number.isFinite(offset) ? offset : 0,
        count: data.length,
      },
    };
  });
};
