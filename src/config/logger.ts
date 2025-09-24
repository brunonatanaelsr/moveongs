import { context as otelContext, trace } from '@opentelemetry/api';
import pino from 'pino';

import { getEnv } from './env';
import { getLogContext } from '../observability/log-context';

const env = getEnv();

export const logger = pino({
  level: env.LOG_LEVEL,
  messageKey: 'message',
  base: {
    service: env.OTEL_SERVICE_NAME,
    environment: env.NODE_ENV,
    version: process.env.npm_package_version ?? '0.0.0',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  mixin() {
    const contextValues = { ...getLogContext() } as Record<string, unknown>;
    const span = trace.getSpan(otelContext.active());
    if (span) {
      const spanContext = span.spanContext();
      contextValues.trace_id = spanContext.traceId;
      contextValues.span_id = spanContext.spanId;
    }

    return contextValues;
  },
});
