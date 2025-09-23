import { z } from 'zod';

export const postVisibilitySchema = z.enum(['internal', 'project', 'public', 'hidden']);

export const listPostsQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  beneficiaryId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
  offset: z.coerce.number().min(0).default(0),
  includeHidden: z
    .union([z.literal('1'), z.literal('true'), z.literal('0'), z.literal('false')])
    .optional(),
});

export const createPostBodySchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(180).optional(),
  body: z.string().trim().min(1).max(5000),
  tags: z.array(z.string().trim().min(1).max(32)).max(10).optional(),
  visibility: postVisibilitySchema.optional(),
  publishedAt: z.string().datetime().optional(),
});

export const updatePostBodySchema = z
  .object({
    projectId: z.string().uuid().nullable().optional(),
    title: z.string().trim().min(1).max(180).nullable().optional(),
    body: z.string().trim().min(1).max(5000).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(32)).max(10).optional(),
    visibility: postVisibilitySchema.optional(),
    publishedAt: z.string().datetime().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Nenhum campo fornecido para atualização',
  });

export const postIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const commentIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const createCommentBodySchema = z.object({
  body: z.string().trim().min(1).max(2000),
});
