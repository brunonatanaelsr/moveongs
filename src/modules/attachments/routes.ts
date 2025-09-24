import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../shared/errors';
import {
  attachmentIdParamSchema,
  listAttachmentsQuerySchema,
  uploadAttachmentFieldsSchema,
} from './schemas';
import {
  getAttachmentOrFail,
  listOwnerAttachments,
  loadAttachmentFile,
  removeAttachment,
  uploadAttachment,
} from './service';

const READ_REQUIREMENTS = {
  roles: ['admin', 'coordenacao', 'tecnica', 'educadora', 'recepcao', 'financeiro', 'voluntaria', 'leitura_externa'],
  permissions: ['attachments:read'],
} as const;
const UPLOAD_REQUIREMENTS = {
  roles: ['admin', 'coordenacao', 'tecnica', 'educadora', 'recepcao'],
  permissions: ['attachments:upload'],
} as const;
const DELETE_REQUIREMENTS = {
  roles: ['admin', 'coordenacao'],
  permissions: ['attachments:delete'],
} as const;

export const attachmentRoutes: FastifyPluginAsync = async (app) => {
  app.post('/files', {
    preHandler: [app.authenticate, app.authorize(UPLOAD_REQUIREMENTS)],
  }, async (request, reply) => {
    const file = await request.file();

    if (!file) {
      throw new AppError('No file provided', 400);
    }

    const fieldEntries: Record<string, string> = {};
    for (const [key, value] of Object.entries(file.fields ?? {})) {
      if (Array.isArray(value)) {
        const first = value[0];
        if (first && typeof first === 'object' && 'value' in first) {
          fieldEntries[key] = String((first as any).value ?? '');
        }
      } else if (value && typeof value === 'object' && 'value' in value) {
        fieldEntries[key] = String((value as any).value ?? '');
      }
    }

    const parsedFields = uploadAttachmentFieldsSchema.safeParse(fieldEntries);
    if (!parsedFields.success) {
      throw new AppError('Invalid fields', 400, parsedFields.error.flatten());
    }

    const buffer = await file.toBuffer();

    const attachment = await uploadAttachment({
      ownerType: parsedFields.data.ownerType,
      ownerId: parsedFields.data.ownerId,
      buffer,
      filename: file.filename,
      mimeType: file.mimetype,
      uploadedBy: request.user?.sub ?? null,
    });

    return reply.code(201).send({ attachment });
  });

  app.get('/attachments', {
    preHandler: [app.authenticate, app.authorize(READ_REQUIREMENTS)],
  }, async (request) => {
    const parsed = listAttachmentsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new AppError('Invalid query', 400, parsed.error.flatten());
    }

    const attachments = await listOwnerAttachments({
      ownerType: parsed.data.ownerType,
      ownerId: parsed.data.ownerId,
    });

    return { data: attachments };
  });

  app.get('/attachments/:id', {
    preHandler: [app.authenticate, app.authorize(READ_REQUIREMENTS)],
  }, async (request, reply) => {
    const params = attachmentIdParamSchema.safeParse(request.params);
    if (!params.success) {
      throw new AppError('Invalid params', 400, params.error.flatten());
    }

    const query = request.query as { download?: string } | undefined;
    const shouldDownload = query?.download === '1' || query?.download === 'true';

    if (shouldDownload) {
      const { metadata, buffer } = await loadAttachmentFile(params.data.id);
      reply.header('Content-Type', metadata.mimeType ?? 'application/octet-stream');
      reply.header('Content-Disposition', `attachment; filename="${metadata.fileName}"`);
      return reply.send(buffer);
    }

    const attachment = await getAttachmentOrFail(params.data.id);
    return { attachment };
  });

  app.delete('/attachments/:id', {
    preHandler: [app.authenticate, app.authorize(DELETE_REQUIREMENTS)],
  }, async (request) => {
    const params = attachmentIdParamSchema.safeParse(request.params);
    if (!params.success) {
      throw new AppError('Invalid params', 400, params.error.flatten());
    }

    const attachment = await removeAttachment(params.data.id, request.user?.sub ?? null);
    return { attachment };
  });
};
