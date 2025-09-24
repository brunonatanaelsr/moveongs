import { z } from 'zod';

const isoDateTime = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: 'Invalid datetime format',
});

export const createConsentBodySchema = z.object({
  type: z.string().min(2),
  textVersion: z.string().min(1),
  granted: z.boolean().default(true),
  grantedAt: isoDateTime.optional(),
  evidence: z.record(z.string(), z.any()).optional(),
});

export const updateConsentBodySchema = z.object({
  textVersion: z.string().min(1).optional(),
  granted: z.boolean().optional(),
  grantedAt: isoDateTime.optional(),
  revokedAt: isoDateTime.optional(),
  evidence: z.record(z.string(), z.any()).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'No fields provided for update',
});

export const listConsentQuerySchema = z.object({
  type: z.string().optional(),
  includeRevoked: z.coerce.boolean().optional(),
});

export const consentIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const consentReviewCompletionBodySchema = z.object({
  justification: z.string().max(500).optional(),
});

export type CreateConsentBody = z.infer<typeof createConsentBodySchema>;
export type UpdateConsentBody = z.infer<typeof updateConsentBodySchema>;
export type ListConsentQuery = z.infer<typeof listConsentQuerySchema>;
