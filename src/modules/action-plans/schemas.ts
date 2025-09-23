import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const createActionPlanBodySchema = z.object({
  beneficiaryId: z.string().uuid(),
  status: z.enum(['active', 'completed', 'archived']).optional(),
});

export const updateActionPlanBodySchema = z.object({
  status: z.enum(['active', 'completed', 'archived']).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'No fields provided for update',
});

export const createActionItemBodySchema = z.object({
  title: z.string().min(3),
  responsible: z.string().optional().nullable(),
  dueDate: isoDate.optional().nullable(),
  status: z.enum(['pending', 'in_progress', 'done', 'blocked']).optional(),
  support: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const updateActionItemBodySchema = z.object({
  title: z.string().min(3).optional(),
  responsible: z.string().optional().nullable(),
  dueDate: isoDate.optional().nullable(),
  status: z.enum(['pending', 'in_progress', 'done', 'blocked']).optional(),
  support: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  completedAt: isoDate.optional().nullable(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'No fields provided for update',
});

export const actionPlanIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const actionItemIdParamSchema = z.object({
  itemId: z.string().uuid(),
});

export const listActionPlansQuerySchema = z.object({
  status: z.enum(['active', 'completed', 'archived']).optional(),
});

export const actionItemsSummaryQuerySchema = z.object({
  status: z.enum(['pending', 'in_progress', 'done', 'blocked']).optional(),
  dueBefore: isoDate.optional(),
});

export type CreateActionPlanBody = z.infer<typeof createActionPlanBodySchema>;
export type UpdateActionPlanBody = z.infer<typeof updateActionPlanBodySchema>;
export type CreateActionItemBody = z.infer<typeof createActionItemBodySchema>;
export type UpdateActionItemBody = z.infer<typeof updateActionItemBodySchema>;
export type ListActionPlansQuery = z.infer<typeof listActionPlansQuerySchema>;
export type ActionItemsSummaryQuery = z.infer<typeof actionItemsSummaryQuerySchema>;
