import { z } from 'zod';

export const listFormTemplatesQuerySchema = z.object({
  formType: z.string().min(1).optional(),
  status: z.string().min(1).optional(),
});

export const createFormTemplateBodySchema = z.object({
  formType: z.string().min(1),
  schemaVersion: z.string().min(1),
  schema: z.record(z.string(), z.any()),
  status: z.enum(['active', 'inactive']).optional(),
});

export const updateFormTemplateBodySchema = z.object({
  schema: z.record(z.string(), z.any()).optional(),
  status: z.enum(['active', 'inactive']).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided',
});

const isoDateTime = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: 'Invalid datetime format',
});

export const formAttachmentSchema = z.object({
  id: z.string().uuid().optional(),
  fileName: z.string().optional().nullable(),
  url: z.string().url().optional(),
  mimeType: z.string().optional().nullable(),
  sizeBytes: z.number().int().nonnegative().optional(),
}).catchall(z.unknown());

const baseSubmissionSchema = z.object({
  formType: z.string().min(1),
  schemaVersion: z.string().min(1).optional(),
  payload: z.record(z.string(), z.any()),
  signedBy: z.array(z.string().min(1)).optional(),
  signedAt: z.array(isoDateTime).optional(),
  attachments: z.array(formAttachmentSchema).optional(),
});

export const createFormSubmissionBodySchema = baseSubmissionSchema.superRefine((data, ctx) => {
  if (data.signedAt && data.signedBy && data.signedAt.length !== data.signedBy.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'signedAt must have the same number of entries as signedBy',
      path: ['signedAt'],
    });
  }
});

export const updateFormSubmissionBodySchema = z.object({
  payload: z.record(z.string(), z.any()).optional(),
  signedBy: z.array(z.string().min(1)).nullable().optional(),
  signedAt: z.array(isoDateTime).nullable().optional(),
  attachments: z.array(formAttachmentSchema).nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.signedAt && data.signedBy && data.signedAt.length !== data.signedBy.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'signedAt must have the same number of entries as signedBy',
      path: ['signedAt'],
    });
  }
});

export const listBeneficiaryFormsQuerySchema = z.object({
  formType: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

export const submissionIdParamSchema = z.object({
  id: z.string().uuid(),
});

export type CreateFormTemplateBody = z.infer<typeof createFormTemplateBodySchema>;
export type UpdateFormTemplateBody = z.infer<typeof updateFormTemplateBodySchema>;
export type CreateFormSubmissionBody = z.infer<typeof createFormSubmissionBodySchema>;
export type UpdateFormSubmissionBody = z.infer<typeof updateFormSubmissionBodySchema>;
export type ListFormTemplatesQuery = z.infer<typeof listFormTemplatesQuerySchema>;
export type ListBeneficiaryFormsQuery = z.infer<typeof listBeneficiaryFormsQuerySchema>;
