import { z } from 'zod';

export const threadVisibilitySchema = z.enum(['internal', 'project', 'private']);
export const messageVisibilitySchema = z.enum(['internal', 'project', 'private']);

export const threadIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const listThreadsQuerySchema = z.object({
  scope: z.string().trim().min(1).max(120).optional(),
});

export const createThreadBodySchema = z.object({
  scope: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(1).max(200).nullable().optional(),
  visibility: threadVisibilitySchema.optional(),
  memberIds: z.array(z.string().uuid()).max(50).optional().default([]),
  initialMessage: z
    .object({
      body: z.string().trim().min(1).max(5000),
      visibility: messageVisibilitySchema.optional(),
      isConfidential: z.boolean().optional(),
    })
    .optional(),
});

export const createMessageBodySchema = z.object({
  body: z.string().trim().min(1).max(5000),
  visibility: messageVisibilitySchema.optional(),
  isConfidential: z.boolean().optional(),
});
