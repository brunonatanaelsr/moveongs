import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../shared/errors';
import { getUserById } from '../users/repository';
import { loginBodySchema, passwordForgotBodySchema, passwordResetBodySchema } from './schemas';
import { requestPasswordReset, resetPasswordWithToken, validateCredentials } from './service';

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/auth/login', async (request, reply) => {
    const parsed = loginBodySchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError('Invalid credentials', 400, parsed.error.flatten());
    }

    const user = await validateCredentials(parsed.data.email, parsed.data.password);

    const roles = user.roles.map((role) => role.slug);
    const projectScopes = Array.from(new Set(user.roles.map((role) => role.projectId).filter(Boolean))) as string[];
    const permissionKeys = user.permissions.map((permission) => permission.key);

    const token = app.jwt.sign({
      sub: user.id,
      email: user.email,
      name: user.name,
      roles,
      projectScopes,
      permissions: permissionKeys,
    });

    return reply.send({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roles: user.roles,
        permissions: user.permissions,
      },
    });
  });

  app.get('/auth/me', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const user = await getUserById(request.user.sub);

    if (!user) {
      throw new AppError('User not found', 404);
    }

    return { user };
  });

  app.post('/auth/logout', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const token = request.headers.authorization?.replace('Bearer ', '') ?? '';
    // Stateless JWT: clients should discard the token. Hook for future blacklist implementation.
    return reply.code(200).send({ revoked: Boolean(token) });
  });

  app.post('/auth/password/forgot', async (request, reply) => {
    const parsed = passwordForgotBodySchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError('Invalid request', 400, parsed.error.flatten());
    }

    await requestPasswordReset(parsed.data.email, parsed.data.redirectTo);

    return reply.code(202).send({ message: 'If the account exists, recovery instructions were sent.' });
  });

  app.post('/auth/password/reset', async (request, reply) => {
    const parsed = passwordResetBodySchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError('Invalid request', 400, parsed.error.flatten());
    }

    await resetPasswordWithToken(parsed.data.token, parsed.data.password);

    return reply.code(204).send();
  });
};
