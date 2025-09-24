import { z } from 'zod';

export const totpSetupBodySchema = z
  .object({
    label: z.string().min(1).max(120).optional(),
    accountLabel: z.string().min(1).max(255).optional(),
  })
  .optional();

export const totpConfirmBodySchema = z.object({
  methodId: z.string().uuid(),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/)
    .or(z.string().trim().min(6).max(12)),
});

export const totpDisableParamsSchema = z.object({
  methodId: z.string().uuid(),
});

export const webauthnRegistrationStartSchema = z.object({
  deviceName: z.string().min(1).max(120).optional(),
  label: z.string().min(1).max(120).optional(),
});

export const webauthnRegistrationVerifySchema = z.object({
  challengeId: z.string().uuid(),
  response: z.any(),
});

export const webauthnCredentialParamsSchema = z.object({
  credentialId: z.string().uuid(),
});

export const verifyMfaChallengeSchema = z
  .object({
    challengeId: z.string().uuid(),
    method: z.enum(['totp', 'webauthn']),
    code: z.string().optional(),
    response: z.any().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.method === 'totp' && (!value.code || value.code.trim().length === 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Código TOTP é obrigatório', path: ['code'] });
    }
    if (value.method === 'webauthn' && !value.response) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Resposta WebAuthn é obrigatória', path: ['response'] });
    }
  });
