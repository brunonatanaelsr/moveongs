import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../shared/errors';
import { addWebhookSubscription, listWebhookSubscriptions, removeWebhookSubscription } from './webhook-registry';
import { createWebhookSchema, webhookIdParamSchema } from './schemas';

const NOTIFICATION_ADMIN_ROLES = ['admin', 'coordenacao'];

export const notificationRoutes: FastifyPluginAsync = async (app) => {
  app.get('/notifications/webhooks', {
    preHandler: [app.authenticate, app.authorize(NOTIFICATION_ADMIN_ROLES)],
  }, async () => {
    const webhooks = listWebhookSubscriptions();
    return { data: webhooks };
  });

  app.post('/notifications/webhooks', {
    preHandler: [app.authenticate, app.authorize(NOTIFICATION_ADMIN_ROLES)],
  }, async (request, reply) => {
    const parsedBody = createWebhookSchema.safeParse(request.body);
    if (!parsedBody.success) {
      throw new AppError('Invalid body', 400, parsedBody.error.flatten());
    }

    const webhook = addWebhookSubscription(parsedBody.data);
    return reply.code(201).send({ webhook });
  });

  app.delete('/notifications/webhooks/:id', {
    preHandler: [app.authenticate, app.authorize(NOTIFICATION_ADMIN_ROLES)],
  }, async (request, reply) => {
    const params = webhookIdParamSchema.safeParse(request.params);
    if (!params.success) {
      throw new AppError('Invalid params', 400, params.error.flatten());
    }

    const removed = removeWebhookSubscription(params.data.id);
    if (!removed) {
      throw new AppError('Webhook not found', 404);
    }

    return reply.code(204).send();
  });
};

