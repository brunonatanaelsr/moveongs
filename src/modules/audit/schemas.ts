import { z } from 'zod';

const isoDateTime = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: 'Invalid datetime format',
});

export const listAuditLogsQuerySchema = z.object({
  entity: z.string().optional(),
  entityId: z.string().optional(),
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});
