import { context as otelContext, trace } from '@opentelemetry/api';
import { randomUUID } from 'node:crypto';

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
import { setLogContext } from './observability/log-context';

export async function createApp(): Promise<FastifyInstance> {
  const env = getEnv();
  const app = fastify({
    logger: logger.child({ component: 'http' }),
    genReqId(request) {
      return (request.headers['x-request-id'] as string | undefined) ?? randomUUID();
    },
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'correlation_id',
  });

  app.addHook('onRequest', (request, reply, done) => {
    const correlationId = request.id ?? randomUUID();
    reply.header('x-request-id', correlationId);

    setLogContext({ correlation_id: correlationId });

    const span = trace.getSpan(otelContext.active());
    if (span) {
      const spanContext = span.spanContext();
      setLogContext({ trace_id: spanContext.traceId, span_id: spanContext.spanId });
      span.setAttribute('http.request_id', correlationId);
    }

    request.log = request.log.child({ correlation_id: correlationId });
    done();
  });

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

  return app;
}
