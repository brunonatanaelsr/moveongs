import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const analyticsOverviewQuerySchema = z.object({
  from: z.string().regex(dateRegex).optional(),
  to: z.string().regex(dateRegex).optional(),
  projectId: z.string().uuid().optional(),
  cohortId: z.string().uuid().optional(),
});

export const analyticsTimeseriesQuerySchema = analyticsOverviewQuerySchema.extend({
  metric: z.enum(['beneficiarias', 'matriculas', 'assiduidade']),
  interval: z.enum(['day', 'week', 'month']).default('day'),
});

export const analyticsProjectParamSchema = z.object({
  id: z.string().uuid(),
});

export const exportQuerySchema = analyticsOverviewQuerySchema.extend({
  format: z.enum(['csv', 'pdf', 'xlsx']).default('csv'),
});
