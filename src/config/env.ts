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
  ATTACHMENTS_STORAGE: z.enum(['filesystem', 's3']).default('filesystem'),
  ATTACHMENT_ALLOWED_MIME_TYPES: z.string().optional(),
  ATTACHMENT_MAX_SIZE_BYTES: z.string().regex(/^[0-9]+$/).default('10485760'),
  ANTIVIRUS_HOST: z.string().optional(),
  ANTIVIRUS_PORT: z.string().regex(/^[0-9]+$/).default('3310'),
  ANTIVIRUS_TLS: z.enum(['true', 'false']).default('false'),
  ANTIVIRUS_PATH: z.string().default('/scan'),
  ANTIVIRUS_API_KEY: z.string().optional(),
  ANTIVIRUS_TIMEOUT_MS: z.string().regex(/^[0-9]+$/).default('10000'),
  ANTIVIRUS_ALLOW_ON_ERROR: z.enum(['true', 'false']).default('false'),
  S3_BUCKET: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('false'),
  S3_SERVER_SIDE_ENCRYPTION: z.string().optional(),
  DATA_RETENTION_DAYS: z.string().regex(/^[0-9]+$/).default('365'),
  DATA_RETENTION_ANONYMIZE_DAYS: z.string().regex(/^[0-9]+$/).default('180'),
  RATE_LIMIT_MAX: z.string().regex(/^[0-9]+$/).default('100'),
  RATE_LIMIT_TIME_WINDOW_MS: z.string().regex(/^[0-9]+$/).default('60000'),
  TOKEN_ROTATION_TTL_MINUTES: z.string().regex(/^[0-9]+$/).default('1440'),
  TOKEN_ROTATION_REUSE_WINDOW_MINUTES: z.string().regex(/^[0-9]+$/).default('5'),
  MFA_TOTP_ISSUER: z.string().default('MOVEONGS'),
  MFA_LOGIN_CHALLENGE_TTL_SECONDS: z.string().regex(/^[0-9]+$/).default('300'),
  WEBAUTHN_RP_ID: z.string().default('imm.local'),
  WEBAUTHN_RP_NAME: z.string().default('MOVE ONG Backend'),
  WEBAUTHN_RP_ORIGIN: z.string().url().default('https://imm.local'),
  CONSENT_REVIEW_INTERVAL_DAYS: z.string().regex(/^[0-9]+$/).default('365'),
  CONSENT_REVIEW_NOTIFICATION_COOLDOWN_DAYS: z.string().regex(/^[0-9]+$/).default('30'),
  FORM_VERIFICATION_BASE_URL: z.string().url().optional(),
  FORM_VERIFICATION_HASH_SECRET: z.string().min(16).optional(),
});

type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  const source = { ...process.env };

  if (source.NODE_ENV === 'test' || process.env.NODE_ENV === 'test') {
    source.RESPONSE_MASKING_ENABLED = source.RESPONSE_MASKING_ENABLED ?? 'false';
  }

  if (source.NODE_ENV === 'test') {
    return envSchema.parse(source);
  }

  if (!cachedEnv) {
    cachedEnv = envSchema.parse(source);
  }

  return cachedEnv;
}
