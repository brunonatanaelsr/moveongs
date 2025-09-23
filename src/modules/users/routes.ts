import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../shared/errors';
import { createUser, listAllUsers } from './service';
import { createUserBodySchema } from './schemas';

export const userRoutes: FastifyPluginAsync = async (app) => {
  app.post('/users', {
    preHandler: [app.authenticate, app.authorize(['admin'])],
  }, async (request, reply) => {
    const parsed = createUserBodySchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError('Invalid body', 400, parsed.error.flatten());
    }

    const user = await createUser(parsed.data);

    return reply.code(201).send({
      id: user.id,
      name: user.name,
      email: user.email,
      isActive: user.isActive,
      roles: user.roles,
      permissions: user.permissions,
      createdAt: user.createdAt,
    });
  });

  app.get('/users', {
    preHandler: [app.authenticate, app.authorize(['admin', 'coordenacao'])],
  }, async () => {
    const users = await listAllUsers();
    return { data: users };
  });
};
