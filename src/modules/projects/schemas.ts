import { z } from 'zod';

export const createProjectBodySchema = z.object({
  name: z.string().min(3),
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().optional().nullable(),
  active: z.boolean().optional(),
});

export const updateProjectBodySchema = createProjectBodySchema.partial();

export const projectIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const listProjectsQuerySchema = z.object({
  includeInactive: z.coerce.boolean().optional(),
});

const timePattern = /^\d{2}:\d{2}$/;

export const createCohortBodySchema = z.object({
  code: z.string().min(1).optional().nullable(),
  weekday: z.number().int().min(0).max(6),
  shift: z.enum(['manha', 'tarde', 'noite', 'integral']),
  startTime: z.string().regex(timePattern),
  endTime: z.string().regex(timePattern),
  capacity: z.number().int().positive().optional().nullable(),
  location: z.string().optional().nullable(),
  educatorIds: z.array(z.string().uuid()).default([]),
});

export const cohortIdParamSchema = z.object({
  cohortId: z.string().uuid(),
});
