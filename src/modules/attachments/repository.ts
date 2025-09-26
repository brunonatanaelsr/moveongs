import { Kysely } from 'kysely';
import { Database } from '../../db/types';
import { logger } from '../../observability/logger';

export interface Attachment {
  id: string;
  filename: string;
  mimetype: string;
  key: string;
  createdAt: Date;
  scannedAt: Date | null;
  isInfected: boolean;
  virusNames: string[] | null;
}

class AttachmentsRepository {
  async saveAttachment(
    db: Kysely<Database>,
    attachment: Pick<Attachment, 'id' | 'filename' | 'mimetype' | 'key'>,
  ): Promise<void> {
    logger.debug({ attachment }, 'Saving attachment');

    await db
      .insertInto('attachments')
      .values({
        id: attachment.id,
        filename: attachment.filename,
        mimetype: attachment.mimetype,
        key: attachment.key,
      })
      .execute();
  }

  async getAttachment(
    db: Kysely<Database>,
    id: string,
  ): Promise<Pick<Attachment, 'filename' | 'mimetype' | 'key'> | undefined> {
    logger.debug({ id }, 'Getting attachment');

    const result = await db
      .selectFrom('attachments')
      .select(['filename', 'mimetype', 'key'])
      .where('id', '=', id)
      .executeTakeFirst();

    return result;
  }

  async updateScanResult(
    db: Kysely<Database>,
    id: string,
    isInfected: boolean,
    virusNames: string[] | null,
  ): Promise<void> {
    logger.debug({ id, isInfected, virusNames }, 'Updating attachment scan result');

    await db
      .updateTable('attachments')
      .set({
        scannedAt: new Date(),
        isInfected,
        virusNames,
      })
      .where('id', '=', id)
      .execute();
  }

  async listPendingScans(
    db: Kysely<Database>,
    limit = 100,
  ): Promise<Pick<Attachment, 'id' | 'key'>[]> {
    return db
      .selectFrom('attachments')
      .select(['id', 'key'])
      .where('scannedAt', 'is', null)
      .limit(limit)
      .execute();
  }
}

export const attachmentsRepository = new AttachmentsRepository();
