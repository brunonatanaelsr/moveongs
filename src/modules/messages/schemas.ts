import { z } from 'zod';

export const threadVisibilitySchema = z.enum(['internal', 'project', 'private']);
export const messageVisibilitySchema = z.enum(['internal', 'project', 'private']);
export const retentionClassificationSchema = z.enum(['publico_interno', 'sensivel', 'confidencial']);

const retentionExpiresAtSchema = z
  .string()
  .datetime({ message: 'Data de retenção inválida' })
  .nullable()
  .optional();

const searchTermsSchema = z
  .array(z.string().trim().min(1).max(200))
  .max(25)
  .optional();

const mentionIdsSchema = z.array(z.string().uuid()).max(50).optional();
const attachmentIdsSchema = z.array(z.string().uuid()).max(20).optional();

export const threadIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const listThreadsQuerySchema = z
  .object({
    scope: z.string().trim().min(1).max(120).optional(),
    search: z.string().trim().min(2).max(200).optional(),
    classification: z
      .union([retentionClassificationSchema, z.array(retentionClassificationSchema)])
      .optional(),
  })
  .transform((value) => ({
    scope: value.scope,
    search: value.search,
    classifications: value.classification
      ? Array.isArray(value.classification)
        ? Array.from(new Set(value.classification))
        : [value.classification]
      : undefined,
  }));

export const createThreadBodySchema = z.object({
  scope: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(1).max(200).nullable().optional(),
  visibility: threadVisibilitySchema.optional(),
  classification: retentionClassificationSchema.optional(),
  retentionExpiresAt: retentionExpiresAtSchema,
  searchTerms: searchTermsSchema,
  memberIds: z.array(z.string().uuid()).max(50).optional().default([]),
  initialMessage: z
    .object({
      body: z.string().trim().min(1).max(5000),
      visibility: messageVisibilitySchema.optional(),
      isConfidential: z.boolean().optional(),
      classification: retentionClassificationSchema.optional(),
      retentionExpiresAt: retentionExpiresAtSchema,
      mentions: mentionIdsSchema,
      attachments: attachmentIdsSchema,
      searchTerms: searchTermsSchema,
    })
    .optional(),
});

export const createMessageBodySchema = z.object({
  body: z.string().trim().min(1).max(5000),
  visibility: messageVisibilitySchema.optional(),
  isConfidential: z.boolean().optional(),
  classification: retentionClassificationSchema.optional(),
  retentionExpiresAt: retentionExpiresAtSchema,
  mentions: mentionIdsSchema,
  attachments: attachmentIdsSchema,
  searchTerms: searchTermsSchema,
});
