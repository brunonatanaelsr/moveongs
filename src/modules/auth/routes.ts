import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../shared/errors';
import { getUserById } from '../users/repository';
import { loginBodySchema, passwordForgotBodySchema, passwordResetBodySchema } from './schemas';
import { requestPasswordReset, resetPasswordWithToken, validateCredentials } from './service';
import {
  confirmTotpEnrollment,
  createAuthenticationSession,
  disableTotp,
  generateWebauthnAuthenticationOptions,
  generateWebauthnRegistrationOptions,
  getUserMfaStatus,
  initiateTotpEnrollment,
  verifyTotpAuthentication,
  verifyWebauthnAuthentication,
  verifyWebauthnRegistration,
} from './mfa/service';
import {
  totpConfirmBodySchema,
  totpLoginBodySchema,
  totpSetupBodySchema,
  webauthnAuthenticationOptionsSchema,
  webauthnAuthenticationVerifySchema,
  webauthnRegistrationOptionsSchema,
  webauthnRegistrationVerifySchema,
} from './mfa/schemas';

function buildAuthResponse(app: any, user: Awaited<ReturnType<typeof validateCredentials>>) {
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

  return {
    token,
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
    const status = await getUserMfaStatus(user.id);
    const methods: string[] = [];
    if (status.totpEnabled) {
      methods.push('totp');
    }
    if (status.webauthnEnabled) {
      methods.push('webauthn');
    }

    if (methods.length > 0) {
      const session = await createAuthenticationSession({ user, methods });
      return reply.send({
        mfaRequired: true,
        methods,
        session,
      });
    }

    const response = buildAuthResponse(app, user);
    return reply.send(response);
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

  app.post('/auth/mfa/totp/setup', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const parsed = totpSetupBodySchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      throw new AppError('Invalid request', 400, parsed.error.flatten());
    }

    const user = await getUserById(request.user.sub);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const enrollment = await initiateTotpEnrollment({
      user: { id: user.id, email: user.email, name: user.name },
      label: parsed.data.label,
    });

    return enrollment;
  });

  app.post('/auth/mfa/totp/confirm', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const parsed = totpConfirmBodySchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError('Invalid request', 400, parsed.error.flatten());
    }

    await confirmTotpEnrollment({
      userId: request.user.sub,
      factorId: parsed.data.factorId,
      code: parsed.data.code,
    });

    return { confirmed: true };
  });

  app.delete('/auth/mfa/totp', {
    preHandler: [app.authenticate],
  }, async (request) => {
    await disableTotp({ userId: request.user.sub });
    return { disabled: true };
  });

  app.post('/auth/mfa/totp/verify', async (request, reply) => {
    const parsed = totpLoginBodySchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError('Invalid request', 400, parsed.error.flatten());
    }

    const user = await verifyTotpAuthentication(parsed.data);
    const response = buildAuthResponse(app, user);

    return reply.send(response);
  });

  app.post('/auth/mfa/webauthn/registration/options', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const parsed = webauthnRegistrationOptionsSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      throw new AppError('Invalid request', 400, parsed.error.flatten());
    }

    const user = await getUserById(request.user.sub);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const { options, sessionId } = await generateWebauthnRegistrationOptions({
      user: { id: user.id, email: user.email, name: user.name },
      sessionId: parsed.data.sessionId,
      authenticatorName: parsed.data.authenticatorName,
    });

    return { options, sessionId };
  });

  app.post('/auth/mfa/webauthn/registration/verify', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const parsed = webauthnRegistrationVerifySchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError('Invalid request', 400, parsed.error.flatten());
    }

    await verifyWebauthnRegistration({
      sessionId: parsed.data.sessionId,
      response: parsed.data.response,
      authenticatorName: parsed.data.authenticatorName,
      userId: request.user.sub,
    });

    return { registered: true };
  });

  app.post('/auth/mfa/webauthn/options', async (request) => {
    const parsed = webauthnAuthenticationOptionsSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError('Invalid request', 400, parsed.error.flatten());
    }

    const options = await generateWebauthnAuthenticationOptions({ sessionId: parsed.data.sessionId });
    return { options };
  });

  app.post('/auth/mfa/webauthn/verify', async (request, reply) => {
    const parsed = webauthnAuthenticationVerifySchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError('Invalid request', 400, parsed.error.flatten());
    }

    const user = await verifyWebauthnAuthentication({
      sessionId: parsed.data.sessionId,
      response: parsed.data.response,
    });

    const response = buildAuthResponse(app, user);
    return reply.send(response);
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
