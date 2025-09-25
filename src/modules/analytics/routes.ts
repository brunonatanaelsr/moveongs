import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../shared/errors';
import {
  analyticsOverviewQuerySchema,
  analyticsTimeseriesQuerySchema,
  analyticsProjectParamSchema,
  exportQuerySchema,
} from './schemas';
import { resolveAnalyticsScope } from './utils';
import { getAnalyticsOverview, getAnalyticsTimeseries, getProjectAnalytics } from './service';
import type { TimeseriesMetric } from './service';
import { exportAnalyticsCsv, exportAnalyticsPdf, exportAnalyticsXlsx } from './export';

export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  const overviewGuard = { permissions: ['analytics:read', 'analytics:read:project'], strategy: 'any' as const };

  app.get('/analytics/overview', {
    preHandler: [app.authenticate, app.authorize(overviewGuard)],
  }, async (request) => {
    const parsed = analyticsOverviewQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new AppError('Invalid query', 400, parsed.error.flatten());
    }

    const scope = resolveAnalyticsScope(request);
    const data = await getAnalyticsOverview({
      ...parsed.data,
      interval: 'day' as const,
      allowedProjectIds: scope.allowedProjectIds,
      scopeKey: scope.scopeKey,
    });

    return data;
  });

  app.get('/analytics/timeseries', {
    preHandler: [app.authenticate, app.authorize(overviewGuard)],
  }, async (request) => {
    const parsed = analyticsTimeseriesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new AppError('Invalid query', 400, parsed.error.flatten());
    }

    const scope = resolveAnalyticsScope(request);
    const data = await getAnalyticsTimeseries(parsed.data.metric as TimeseriesMetric, {
      ...parsed.data,
      allowedProjectIds: scope.allowedProjectIds,
      scopeKey: scope.scopeKey,
    });

    return { data };
  });

  app.get('/analytics/export', {
    preHandler: [app.authenticate, app.authorize(overviewGuard)],
  }, async (request, reply) => {
    const parsed = exportQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new AppError('Invalid query', 400, parsed.error.flatten());
    }

    const scope = resolveAnalyticsScope(request);
    const filters = {
      ...parsed.data,
      interval: 'day' as const,
      allowedProjectIds: scope.allowedProjectIds,
      scopeKey: scope.scopeKey,
    };

    if (parsed.data.format === 'pdf') {
      const { buffer, filename } = await exportAnalyticsPdf(filters);
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      return reply.send(buffer);
    }

    if (parsed.data.format === 'xlsx') {
      const { buffer, filename } = await exportAnalyticsXlsx(filters);
      reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      return reply.send(buffer);
    }

    const { filename, content } = await exportAnalyticsCsv(filters);
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return reply.send(content);
  });

  app.get('/analytics/projects/:id', {
    preHandler: [app.authenticate, app.authorize(overviewGuard)],
  }, async (request) => {
    const params = analyticsProjectParamSchema.safeParse(request.params);
    const query = analyticsOverviewQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) {
      throw new AppError('Invalid request', 400);
    }

    const scope = resolveAnalyticsScope(request);

    if (scope.allowedProjectIds && !scope.allowedProjectIds.includes(params.data.id)) {
      throw new AppError('Projeto fora do escopo do usuário', 403);
    }

    const data = await getProjectAnalytics(params.data.id, {
      ...query.data,
      interval: 'day' as const,
      allowedProjectIds: scope.allowedProjectIds,
      scopeKey: scope.scopeKey,
    });

    return data;
  });
};
