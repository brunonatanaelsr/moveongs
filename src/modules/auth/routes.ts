import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { AppError } from '../../shared/errors';
import { getUserById, type PermissionGrant, type RoleAssignment } from '../users/repository';
import { loginBodySchema, passwordForgotBodySchema, passwordResetBodySchema } from './schemas';
import {
  issueSessionRefreshToken,
  requestPasswordReset,
  resetPasswordWithToken,
  rotateSessionRefreshToken,
  validateCredentials,
  revokeRefreshTokenValue,
} from './service';
import {
  createLoginChallengeForUser,
  verifyTotpLoginChallenge,
  verifyWebAuthnLoginChallenge,
} from '../mfa/service';
import { verifyMfaChallengeSchema } from '../mfa/schemas';

type AuthPayloadUser = {
  id: string;
  name: string;
  email: string;
  roles: RoleAssignment[];
  permissions: PermissionGrant[];
};

function buildAuthResponse(
  app: FastifyInstance,
  user: AuthPayloadUser,
  refreshToken: string,
  refreshExpiresAt: Date,
) {
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

  return {
    token: accessToken,
    refreshToken,
    refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      roles: user.roles,
      permissions: user.permissions,
    },
  };
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/auth/login', async (request, reply) => {
    const parsed = loginBodySchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError('Invalid credentials', 400, parsed.error.flatten());
    }

    const user = await validateCredentials(parsed.data.email, parsed.data.password);

    const challenge = await createLoginChallengeForUser(user.id);
    if (challenge) {
      return reply.code(202).send({
        mfaRequired: true,
        challengeId: challenge.id,
        methods: challenge.methods,
        expiresAt: challenge.expiresAt.toISOString(),
        ...(challenge.webauthnOptions ? { webauthnOptions: challenge.webauthnOptions } : {}),
      });
    }

    const refreshToken = await issueSessionRefreshToken(user.id);
    return reply.send(buildAuthResponse(app, user, refreshToken.token, refreshToken.expiresAt));
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

    return reply.send(buildAuthResponse(app, user, newToken, expiresAt));
  });

  app.post('/auth/mfa/verify', async (request, reply) => {
    const parsed = verifyMfaChallengeSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError('Invalid request', 400, parsed.error.flatten());
    }

    const payload = parsed.data;
    let result: { userId: string };
    if (payload.method === 'totp') {
      result = await verifyTotpLoginChallenge({ challengeId: payload.challengeId, code: payload.code! });
    } else {
      result = await verifyWebAuthnLoginChallenge({ challengeId: payload.challengeId, response: payload.response });
    }

    const user = await getUserById(result.userId);
    if (!user || !user.isActive) {
      throw new AppError('User not found or inactive', 403);
    }

    const refreshToken = await issueSessionRefreshToken(user.id);
    return reply.send(buildAuthResponse(app, user, refreshToken.token, refreshToken.expiresAt));
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
