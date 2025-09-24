import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.string().regex(/^\d+$/).default('3333'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('1d'),
  REDIS_URL: z.string().url().optional(),
  CACHE_TTL_SECONDS: z.string().regex(/^[0-9]+$/).default('300'),
  UPLOADS_DIR: z.string().default('tmp/uploads'),
  NOTIFICATIONS_EMAIL_FROM: z.string().email().default('alerts@imm.local'),
  NOTIFICATIONS_EMAIL_RECIPIENTS: z.string().optional(),
  NOTIFICATIONS_WHATSAPP_NUMBERS: z.string().optional(),
  NOTIFICATIONS_WEBHOOK_TIMEOUT_MS: z.string().regex(/^[0-9]+$/).default('5000'),
  NOTIFICATIONS_WEBHOOK_SECRET: z.string().optional(),
  OTEL_ENABLED: z.enum(['true', 'false']).default('false'),
  OTEL_SERVICE_NAME: z.string().default('moveongs-api'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().default('http://localhost:4318'),
  OTEL_EXPORTER_OTLP_HEADERS: z.string().optional(),
  OTEL_METRICS_EXPORT_INTERVAL_MS: z.string().regex(/^[0-9]+$/).default('60000'),
  OTEL_METRICS_EXPORT_TIMEOUT_MS: z.string().regex(/^[0-9]+$/).default('30000'),
  OTEL_TRACES_SAMPLER: z
    .enum(['always_on', 'always_off', 'traceidratio', 'parentbased_always_on', 'parentbased_always_off'])
    .default('parentbased_always_on'),
  OTEL_TRACES_SAMPLER_ARG: z.string().optional(),
});

type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = envSchema.parse(process.env);
  }

  return cachedEnv;
}
