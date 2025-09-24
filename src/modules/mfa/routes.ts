import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../shared/errors';
import {
  confirmTotpEnrollment,
  disableTotpMethod,
  listUserMfaMethods,
  removeWebAuthnCredential,
  startTotpEnrollment,
  startWebAuthnRegistration,
  completeWebAuthnRegistration,
} from './service';
import {
  totpSetupBodySchema,
  totpConfirmBodySchema,
  totpDisableParamsSchema,
  webauthnRegistrationStartSchema,
  webauthnRegistrationVerifySchema,
  webauthnCredentialParamsSchema,
} from './schemas';

export const mfaRoutes: FastifyPluginAsync = async (app) => {
  app.get('/auth/mfa/methods', { preHandler: [app.authenticate] }, async (request) => {
    const methods = await listUserMfaMethods(request.user.sub);
    return { methods };
  });

  app.post('/auth/mfa/totp/setup', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = totpSetupBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError('Invalid request body', 400, parsed.error.flatten());
    }

    const result = await startTotpEnrollment({
      userId: request.user.sub,
      label: parsed.data?.label,
      accountLabel: parsed.data?.accountLabel ?? request.user.email ?? request.user.sub,
    });

    return reply.code(201).send({
      method: result.method,
      secret: result.secret,
      otpauthUrl: result.otpauthUrl,
    });
  });

  app.post('/auth/mfa/totp/confirm', { preHandler: [app.authenticate] }, async (request) => {
    const body = totpConfirmBodySchema.safeParse(request.body);
    if (!body.success) {
      throw new AppError('Invalid request body', 400, body.error.flatten());
    }

    const method = await confirmTotpEnrollment({
      userId: request.user.sub,
      methodId: body.data.methodId,
      code: body.data.code,
    });

    return { method };
  });

  app.delete('/auth/mfa/totp/:methodId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = totpDisableParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new AppError('Invalid parameters', 400, params.error.flatten());
    }

    await disableTotpMethod({ userId: request.user.sub, methodId: params.data.methodId });
    return reply.code(204).send();
  });

  app.post('/auth/mfa/webauthn/registration/options', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = webauthnRegistrationStartSchema.safeParse(request.body ?? {});
    if (!body.success) {
      throw new AppError('Invalid request body', 400, body.error.flatten());
    }

    const challenge = await startWebAuthnRegistration({
      userId: request.user.sub,
      userEmail: request.user.email ?? `${request.user.sub}@local`,
      userName: request.user.name ?? request.user.email ?? request.user.sub,
      deviceName: body.data.deviceName,
      label: body.data.label,
    });

    return reply.code(201).send({
      challengeId: challenge.challengeId,
      options: challenge.options,
      method: challenge.method,
    });
  });

  app.post('/auth/mfa/webauthn/registration/verify', { preHandler: [app.authenticate] }, async (request) => {
    const body = webauthnRegistrationVerifySchema.safeParse(request.body);
    if (!body.success) {
      throw new AppError('Invalid request body', 400, body.error.flatten());
    }

    const method = await completeWebAuthnRegistration({
      challengeId: body.data.challengeId,
      response: body.data.response,
    });

    return { method };
  });

  app.delete('/auth/mfa/webauthn/credentials/:credentialId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = webauthnCredentialParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new AppError('Invalid parameters', 400, params.error.flatten());
    }

    await removeWebAuthnCredential({
      userId: request.user.sub,
      credentialId: params.data.credentialId,
    });

    return reply.code(204).send();
  });
};
