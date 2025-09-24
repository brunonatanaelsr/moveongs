import { z } from 'zod';

export const issueCertificateBodySchema = z.object({
  type: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const listCertificatesQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(200).optional(),
  offset: z.coerce.number().min(0).optional(),
});

export const certificateIdParamSchema = z.object({
  id: z.string().uuid(),
});
