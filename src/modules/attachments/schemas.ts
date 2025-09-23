import { z } from 'zod';

export const uploadAttachmentFieldsSchema = z.object({
  ownerType: z.string().min(1),
  ownerId: z.string().uuid(),
});

export const listAttachmentsQuerySchema = z.object({
  ownerType: z.string().optional(),
  ownerId: z.string().uuid().optional(),
});

export const attachmentIdParamSchema = z.object({
  id: z.string().uuid(),
});
