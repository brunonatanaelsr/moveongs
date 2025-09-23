import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const createEvolutionBodySchema = z.object({
  date: isoDate,
  description: z.string().min(3),
  category: z.string().optional().nullable(),
  responsible: z.string().optional().nullable(),
  requiresSignature: z.boolean().optional(),
});

export const listEvolutionQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

export const evolutionIdParamSchema = z.object({
  id: z.string().uuid(),
});

export type CreateEvolutionBody = z.infer<typeof createEvolutionBodySchema>;
export type ListEvolutionQuery = z.infer<typeof listEvolutionQuerySchema>;
