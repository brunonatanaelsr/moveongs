import fastify from 'fastify';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';

import { getEnv } from './config/env';
import { logger } from './config/logger';
import { AppError } from './shared/errors';
import { registerModules } from './modules/register-modules';
import { startComplianceJobs } from './modules/compliance/service';

export async function createApp(): Promise<FastifyInstance> {
  const env = getEnv();
  const app = fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

  await app.register(cors, { origin: true });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(multipart);
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  app.setErrorHandler((error: FastifyError | AppError, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof AppError) {
      request.log.warn({ err: error, details: error.details }, 'application error');
      return reply.status(error.statusCode).send({
        message: error.message,
        details: error.details,
      });
    }

    request.log.error({ err: error }, 'unhandled error');
    return reply.status(500).send({ message: 'Internal server error' });
  });

  await registerModules(app);

  if (env.NODE_ENV !== 'test') {
    startComplianceJobs();
  }

  return app;
}
