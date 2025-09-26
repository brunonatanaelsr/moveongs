import { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { logger } from '../../observability/logger';
import { attachmentsRepository } from './repository';
import { antivirusScanner } from './antivirus';
import { storageProvider } from './storage';
import {
  AttachmentNotFoundError,
  InvalidAttachmentError,
  InvalidMimeTypeError,
} from './errors';

export class AttachmentsService {
  constructor(private readonly app: FastifyInstance) {}

  async uploadAttachment(file: {
    filename: string;
    mimetype: string;
    filepath: string;
  }): Promise<string> {
    logger.debug({ file }, 'Uploading new attachment');

    if (!this.isValidMimeType(file.mimetype)) {
      throw new InvalidMimeTypeError();
    }

    // Scan file for viruses
    const scanResult = await antivirusScanner.scanFile(file.filepath);
    if (scanResult.isInfected) {
      throw new InvalidAttachmentError(
        `File is infected with virus: ${scanResult.viruses.join(', ')}`,
      );
    }

    const id = randomUUID();
    const key = `${id}/${file.filename}`;

    await storageProvider.uploadFile(file.filepath, key);
    await attachmentsRepository.saveAttachment(this.app.db, {
      id,
      filename: file.filename,
      mimetype: file.mimetype,
      key,
    });

    return id;
  }

  async getAttachment(id: string): Promise<{
    filename: string;
    mimetype: string;
    url: string;
  }> {
    logger.debug({ id }, 'Getting attachment');

    const attachment = await attachmentsRepository.getAttachment(this.app.db, id);
    if (!attachment) {
      throw new AttachmentNotFoundError();
    }

    const url = await storageProvider.getSignedUrl(attachment.key);

    return {
      filename: attachment.filename,
      mimetype: attachment.mimetype,
      url,
    };
  }

  private isValidMimeType(mimetype: string): boolean {
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'image/webp',
    ];

    return allowedMimeTypes.includes(mimetype);
  }
}

export const attachmentsService = new AttachmentsService(app);
