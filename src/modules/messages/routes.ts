import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../shared/errors';
import {
  createThreadBodySchema,
  createMessageBodySchema,
  listThreadsQuerySchema,
  threadIdParamSchema,
} from './schemas';
import { createThread, getThreadWithMessages, listThreads, postMessage, userCanViewConfidential } from './service';

const READ_REQUIREMENTS = { permissions: ['activities:read'] } as const;
const WRITE_REQUIREMENTS = { permissions: ['activities:create'] } as const;

export const messageRoutes: FastifyPluginAsync = async (app) => {
  app.get('/messages/threads', {
    preHandler: [app.authenticate, app.authorize(READ_REQUIREMENTS)],
  }, async (request) => {
    const parsed = listThreadsQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      throw new AppError('Consulta inválida', 400, parsed.error.flatten());
    }

    const threads = await listThreads({
      userId: request.user.sub,
      scope: parsed.data.scope,
    });

    return { data: threads };
  });

  app.post('/messages/threads', {
    preHandler: [app.authenticate, app.authorize(WRITE_REQUIREMENTS)],
  }, async (request, reply) => {
    const parsed = createThreadBodySchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError('Dados inválidos', 400, parsed.error.flatten());
    }

    const uniqueMemberIds = Array.from(new Set(parsed.data.memberIds)).filter((id) => id !== request.user.sub);

    const result = await createThread({
      userId: request.user.sub,
      scope: parsed.data.scope,
      subject: parsed.data.subject ?? null,
      visibility: parsed.data.visibility,
      memberIds: uniqueMemberIds,
      initialMessage: parsed.data.initialMessage,
      roles: request.user.roles ?? [],
      permissions: request.user.permissions ?? [],
    });

    return reply.code(201).send(result);
  });

  app.get('/messages/threads/:id', {
    preHandler: [app.authenticate, app.authorize(READ_REQUIREMENTS)],
  }, async (request) => {
    const parsedParams = threadIdParamSchema.safeParse(request.params);

    if (!parsedParams.success) {
      throw new AppError('Parâmetros inválidos', 400, parsedParams.error.flatten());
    }

    const canViewConfidential = userCanViewConfidential(request.user.roles ?? [], request.user.permissions ?? []);

    const result = await getThreadWithMessages({
      threadId: parsedParams.data.id,
      userId: request.user.sub,
      canViewConfidential,
    });

    return result;
  });

  app.get('/messages/threads/:id/messages', {
    preHandler: [app.authenticate, app.authorize(READ_REQUIREMENTS)],
  }, async (request) => {
    const parsedParams = threadIdParamSchema.safeParse(request.params);

    if (!parsedParams.success) {
      throw new AppError('Parâmetros inválidos', 400, parsedParams.error.flatten());
    }

    const canViewConfidential = userCanViewConfidential(request.user.roles ?? [], request.user.permissions ?? []);

    const { messages } = await getThreadWithMessages({
      threadId: parsedParams.data.id,
      userId: request.user.sub,
      canViewConfidential,
    });

    return { data: messages };
  });

  app.post('/messages/threads/:id/messages', {
    preHandler: [app.authenticate, app.authorize(WRITE_REQUIREMENTS)],
  }, async (request, reply) => {
    const parsedParams = threadIdParamSchema.safeParse(request.params);
    const parsedBody = createMessageBodySchema.safeParse(request.body);

    if (!parsedParams.success || !parsedBody.success) {
      throw new AppError('Requisição inválida', 400, {
        params: parsedParams.success ? undefined : parsedParams.error.flatten(),
        body: parsedBody.success ? undefined : parsedBody.error.flatten(),
      });
    }

    const message = await postMessage({
      threadId: parsedParams.data.id,
      authorId: request.user.sub,
      body: parsedBody.data.body,
      visibility: parsedBody.data.visibility,
      isConfidential: parsedBody.data.isConfidential,
      roles: request.user.roles ?? [],
      permissions: request.user.permissions ?? [],
    });

    return reply.code(201).send({ message });
  });
};
