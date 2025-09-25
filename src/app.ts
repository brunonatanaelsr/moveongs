import { context as otelContext, trace } from '@opentelemetry/api';
import { randomUUID } from 'node:crypto';

import fastify from 'fastify';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';

import { getEnv } from './config/env';
import { logger } from './config/logger';
import { AppError } from './shared/errors';
import { registerModules } from './modules/register-modules';
import { setLogContext } from './observability/log-context';
import { sanitizeInput } from './shared/security/sanitizer';
import { maskSensitiveData } from './shared/security/mask';
import { startDataRetentionJob, stopDataRetentionJob } from './shared/security/retention';

export async function createApp(): Promise<FastifyInstance> {
  const env = getEnv();
  const app = fastify({
    logger: { level: env.LOG_LEVEL ?? 'info' },
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
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'no-referrer' },
  });
  await app.register(rateLimit, {
    max: Number(env.RATE_LIMIT_MAX),
    timeWindow: Number(env.RATE_LIMIT_TIME_WINDOW_MS),
    allowList: ['127.0.0.1'],
  });
  await app.register(multipart);
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  app.addHook('preValidation', (request, _reply, done) => {
    request.body = sanitizeInput(request.body);
    request.query = sanitizeInput(request.query);
    request.params = sanitizeInput(request.params);
    done();
  });

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');

    const contentType = reply.getHeader('content-type');
    if (contentType && typeof payload === 'string' && contentType.toString().includes('application/json')) {
      try {
        const parsed = JSON.parse(payload);
        const masked = maskSensitiveData(parsed);
        return JSON.stringify(masked);
      } catch {
        return payload;
      }
    }

    if (Buffer.isBuffer(payload)) {
      return payload;
    }

    if (typeof payload === 'object' && payload !== null) {
      return maskSensitiveData(payload);
    }

    return payload;
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

  app.addHook('onReady', async () => {
    startDataRetentionJob();
  });

  app.addHook('onClose', async () => {
    stopDataRetentionJob();
  });

  return app;
}
