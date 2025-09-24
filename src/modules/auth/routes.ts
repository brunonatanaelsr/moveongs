import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../shared/errors';
import { getUserById } from '../users/repository';
import { loginBodySchema, passwordForgotBodySchema, passwordResetBodySchema } from './schemas';
import {
  issueSessionRefreshToken,
  requestPasswordReset,
  resetPasswordWithToken,
  rotateSessionRefreshToken,
  validateCredentials,
  revokeRefreshTokenValue,
} from './service';

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

    const accessToken = app.jwt.sign({
      sub: user.id,
      email: user.email,
      name: user.name,
      roles,
      projectScopes,
      permissions: permissionKeys,
    });

    const refreshToken = await issueSessionRefreshToken(user.id);

    return reply.send({
      token: accessToken,
      refreshToken: refreshToken.token,
      refreshTokenExpiresAt: refreshToken.expiresAt.toISOString(),
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
    const body = request.body as { refreshToken?: string } | undefined;
    if (body?.refreshToken) {
      await revokeRefreshTokenValue(body.refreshToken);
    }

    return reply.code(200).send({ revoked: Boolean(token) });
  });

  app.post('/auth/refresh', async (request, reply) => {
    const body = request.body as { refreshToken?: string } | undefined;

    if (!body?.refreshToken || body.refreshToken.length === 0) {
      throw new AppError('Refresh token is required', 400);
    }

    const { newToken, userId, expiresAt } = await rotateSessionRefreshToken(body.refreshToken);
    const user = await getUserById(userId);

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const roles = user.roles.map((role) => role.slug);
    const projectScopes = Array.from(new Set(user.roles.map((role) => role.projectId).filter(Boolean))) as string[];
    const permissionKeys = user.permissions.map((permission) => permission.key);

    const accessToken = app.jwt.sign({
      sub: user.id,
      email: user.email,
      name: user.name,
      roles,
      projectScopes,
      permissions: permissionKeys,
    });

    return reply.send({
      token: accessToken,
      refreshToken: newToken,
      refreshTokenExpiresAt: expiresAt.toISOString(),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roles: user.roles,
        permissions: user.permissions,
      },
    });
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
