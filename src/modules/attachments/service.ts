import { createHash } from 'node:crypto';
import path from 'node:path';
import { readFile, saveFile, deleteFile } from './storage';
import {
  AttachmentRecord,
  AttachmentScanStatus,
  deleteAttachment,
  getAttachmentById,
  insertAttachment,
  listAttachments,
} from './repository';
import { AppError } from '../../shared/errors';
import { recordAuditLog } from '../../shared/audit';
import { getEnv } from '../../config/env';
import { scanAttachment } from './antivirus';

const DEFAULT_ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'application/pdf',
  'application/zip',
  'text/plain',
];

function getAllowedMimeTypes(): Set<string> {
  const env = getEnv();
  if (env.ATTACHMENT_ALLOWED_MIME_TYPES) {
    return new Set(
      env.ATTACHMENT_ALLOWED_MIME_TYPES.split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    );
  }

  return new Set(DEFAULT_ALLOWED_MIME_TYPES);
}

function validateUpload(buffer: Buffer, mimeType?: string | null) {
  const env = getEnv();
  const maxSize = Number(env.ATTACHMENT_MAX_SIZE_BYTES);

  if (buffer.length > maxSize) {
    throw new AppError('Uploaded file exceeds allowed size', 413);
  }

  if (mimeType) {
    const allowed = getAllowedMimeTypes();
    if (!allowed.has(mimeType)) {
      throw new AppError('Unsupported file type', 415);
    }
  }
}

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

  validateUpload(params.buffer, params.mimeType);

  const sanitizedName = params.filename ? path.basename(params.filename) : null;
  const scanResult = await scanAttachment({
    buffer: params.buffer,
    fileName: sanitizedName,
    mimeType: params.mimeType ?? undefined,
  });

  if (scanResult.status === 'infected') {
    throw new AppError('Uploaded file blocked by antivirus', 422, {
      signature: scanResult.signature,
      message: scanResult.message,
    });
  }

  const checksum = createHash('sha256').update(params.buffer).digest('hex');
  const saved = await saveFile(params.buffer, sanitizedName ?? undefined, params.mimeType ?? null);
  const finalFileName = sanitizedName ?? saved.fileName;

  const attachment = await insertAttachment({
    ownerType: params.ownerType,
    ownerId: params.ownerId,
    filePath: saved.filePath,
    fileName: finalFileName,
    mimeType: params.mimeType ?? null,
    sizeBytes: params.buffer.length,
    checksum,
    uploadedBy: params.uploadedBy ?? null,
    antivirusScanStatus: scanResult.status as AttachmentScanStatus,
    antivirusScanSignature: scanResult.signature ?? null,
    antivirusScanMessage: scanResult.message ?? null,
    antivirusScannedAt: scanResult.scannedAt,
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
