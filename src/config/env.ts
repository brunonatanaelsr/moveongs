import { config } from 'dotenv';
import { z } from 'zod';

import { hydrateProcessEnvFromVault } from './secret-vault';

config();
hydrateProcessEnvFromVault();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.string().regex(/^\d+$/).default('3333'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  RESPONSE_MASKING_ENABLED: z.enum(['true', 'false']).default('true'),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('1d'),
  REDIS_URL: z.string().url().optional(),
  CACHE_TTL_SECONDS: z.string().regex(/^[0-9]+$/).default('300'),
  UPLOADS_DIR: z.string().default('tmp/uploads'),
  ANTIVIRUS_ENABLED: z.enum(['true', 'false']).default('true'),
  ANTIVIRUS_HOST: z.string().default('localhost'),
  ANTIVIRUS_PORT: z.string().regex(/^\d+$/).default('3310'),
  ANTIVIRUS_TIMEOUT_MS: z.string().regex(/^\d+$/).default('30000'),
  NOTIFICATIONS_EMAIL_FROM: z.string().email().default('alerts@imm.local'),
  NOTIFICATIONS_EMAIL_SES_REGION: z.string().default('us-east-1'),
  NOTIFICATIONS_EMAIL_SES_ACCESS_KEY_ID: z.string().optional(),
  NOTIFICATIONS_EMAIL_SES_SECRET_ACCESS_KEY: z.string().optional(),
  NOTIFICATIONS_EMAIL_RECIPIENTS: z.string().optional(),
  NOTIFICATIONS_WHATSAPP_NUMBERS: z.string().optional(),
  NOTIFICATIONS_WHATSAPP_FROM: z.string().default('whatsapp:+14155238886'),
  NOTIFICATIONS_WHATSAPP_TWILIO_ACCOUNT_SID: z
    .string()
    .default('AC00000000000000000000000000000000'),
  NOTIFICATIONS_WHATSAPP_TWILIO_AUTH_TOKEN: z.string().default('test-token'),
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
  SECRET_VAULT_PATH: z.string().optional(),
  PII_ENCRYPTION_KEY: z.string().min(32).optional(),
  PII_ENCRYPTION_KMS_KEY_ID: z.string().optional(),
  PII_ENCRYPTION_CACHE_TTL_SECONDS: z.string().regex(/^[0-9]+$/).default('300'),
  AUDIT_LOG_SIGNING_KEY: z.string().min(32).optional(),
