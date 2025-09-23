import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../shared/errors';
import { listAuditLogsQuerySchema } from './schemas';
import { fetchAuditLogs } from './service';

const AUDIT_READ_REQUIREMENTS = {
  roles: ['admin', 'coordenacao'],
  permissions: ['audit_logs:read'],
} as const;

export const auditRoutes: FastifyPluginAsync = async (app) => {
  app.get('/audit/logs', {
    preHandler: [app.authenticate, app.authorize(AUDIT_READ_REQUIREMENTS)],
  }, async (request) => {
    const parsed = listAuditLogsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new AppError('Invalid query', 400, parsed.error.flatten());
    }

    const logs = await fetchAuditLogs(parsed.data);
    return {
      data: logs,
      meta: {
        limit: parsed.data.limit ?? 50,
        offset: parsed.data.offset ?? 0,
        count: logs.length,
      },
    };
  });
};
