import { createHash } from 'node:crypto';
import { readFile, saveFile, deleteFile } from './storage';
import {
  AttachmentRecord,
  deleteAttachment,
  getAttachmentById,
  insertAttachment,
  listAttachments,
} from './repository';
import { AppError } from '../../shared/errors';
import { recordAuditLog } from '../../shared/audit';

export async function uploadAttachment(params: {
  ownerType: string;
  ownerId: string;
  buffer: Buffer;
  filename?: string | null;
  mimeType?: string | null;
  uploadedBy?: string | null;
}): Promise<AttachmentRecord> {
  if (!params.buffer || params.buffer.length === 0) {
    throw new AppError('Empty file upload is not allowed', 400);
  }

  const checksum = createHash('sha256').update(params.buffer).digest('hex');
  const saved = await saveFile(params.buffer, params.filename ?? undefined);

  const attachment = await insertAttachment({
    ownerType: params.ownerType,
    ownerId: params.ownerId,
    filePath: saved.filePath,
    fileName: params.filename ?? saved.fileName,
    mimeType: params.mimeType ?? null,
    sizeBytes: params.buffer.length,
    checksum,
    uploadedBy: params.uploadedBy ?? null,
  });

  await recordAuditLog({
    userId: params.uploadedBy ?? null,
    entity: 'attachment',
    entityId: attachment.id,
    action: 'upload',
    beforeData: null,
    afterData: attachment,
  });

  return attachment;
}

export async function listOwnerAttachments(params: {
  ownerType?: string;
  ownerId?: string;
}): Promise<AttachmentRecord[]> {
  return listAttachments(params);
}

export async function getAttachmentOrFail(id: string): Promise<AttachmentRecord> {
  const attachment = await getAttachmentById(id);
  if (!attachment) {
    throw new AppError('Attachment not found', 404);
  }
  return attachment;
}

export async function loadAttachmentFile(id: string): Promise<{ metadata: AttachmentRecord; buffer: Buffer }> {
  const attachment = await getAttachmentOrFail(id);
  const buffer = await readFile(attachment.filePath);
  return { metadata: attachment, buffer };
}

export async function removeAttachment(id: string, userId?: string | null): Promise<AttachmentRecord> {
  const attachment = await deleteAttachment(id);
  await deleteFile(attachment.filePath);

  await recordAuditLog({
    userId: userId ?? null,
    entity: 'attachment',
    entityId: attachment.id,
    action: 'delete',
    beforeData: attachment,
    afterData: null,
  });

  return attachment;
}
