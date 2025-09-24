import { z } from 'zod';

export const totpSetupBodySchema = z.object({
  label: z.string().max(100).optional(),
});

export const totpConfirmBodySchema = z.object({
  factorId: z.string().uuid(),
  code: z.string().min(6).max(10),
});

export const totpLoginBodySchema = z.object({
  sessionId: z.string().uuid(),
  code: z.string().min(6).max(10),
});

export const webauthnRegistrationOptionsSchema = z.object({
  authenticatorName: z.string().min(1).max(120),
  sessionId: z.string().uuid().optional(),
});

export const webauthnRegistrationVerifySchema = z.object({
  sessionId: z.string().uuid(),
  authenticatorName: z.string().min(1).max(120),
  response: z.any(),
});

export const webauthnAuthenticationOptionsSchema = z.object({
  sessionId: z.string().uuid(),
});

export const webauthnAuthenticationVerifySchema = z.object({
  sessionId: z.string().uuid(),
  response: z.any(),
});
