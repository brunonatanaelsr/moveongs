import type { FastifyInstance } from 'fastify';
import { ForbiddenError, UnauthorizedError } from '../../shared/errors';

export async function registerAuthDecorators(app: FastifyInstance) {
  app.decorate('authenticate', async (request) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new UnauthorizedError();
    }
  });

  app.decorate('authorize', (requiredRoles: string[]) => async (request) => {
    const userRoles = request.user?.roles ?? [];

    const allowed = requiredRoles.length === 0
      ? true
      : requiredRoles.some((role) => userRoles.includes(role));

    if (!allowed) {
      throw new ForbiddenError('Insufficient permissions');
    }
  });
}
