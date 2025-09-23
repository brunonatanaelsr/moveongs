import { z } from 'zod';

export const enrollmentStatusSchema = z.enum(['active', 'suspended', 'terminated']);

export const createEnrollmentBodySchema = z.object({
  beneficiaryId: z.string().uuid(),
  cohortId: z.string().uuid(),
  enrolledAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: enrollmentStatusSchema.optional(),
  agreementAcceptance: z.record(z.string(), z.any()).optional(),
});

export const updateEnrollmentBodySchema = z.object({
  status: enrollmentStatusSchema.optional(),
  terminatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  terminationReason: z.string().optional().nullable(),
});

export const enrollmentIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const listEnrollmentQuerySchema = z.object({
  beneficiaryId: z.string().uuid().optional(),
  cohortId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  status: enrollmentStatusSchema.optional(),
  activeOnly: z.coerce.boolean().optional(),
  limit: z.coerce.number().optional(),
  offset: z.coerce.number().optional(),
});

export const recordAttendanceBodySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    present: z.boolean(),
    justification: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (!data.present) {
      const justification = data.justification?.trim() ?? '';
      if (justification.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['justification'],
          message: 'Justificativa obrigatória quando marcar ausência',
        });
      }
    }
  });

export const attendanceQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
