import { query, withTransaction } from '../../db';
import { AppError, NotFoundError } from '../../shared/errors';

export type AttachmentScanStatus = 'clean' | 'infected' | 'pending' | 'failed' | 'skipped';

export type AttachmentRecord = {
  id: string;
  ownerType: string;
  ownerId: string;
  filePath: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  checksum: string | null;
  uploadedBy: string | null;
  createdAt: string;
  scanStatus: AttachmentScanStatus;
  scanSignature: string | null;
  scanEngine: string | null;
  scanStartedAt: string | null;
  scanCompletedAt: string | null;
  scanError: string | null;
};

function mapAttachment(row: any): AttachmentRecord {
  return {
    id: row.id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    filePath: row.file_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes ?? null,
    checksum: row.checksum ?? null,
    uploadedBy: row.uploaded_by ?? null,
    createdAt: row.created_at.toISOString(),
    scanStatus: row.scan_status ?? 'skipped',
    scanSignature: row.scan_signature ?? null,
    scanEngine: row.scan_engine ?? null,
    scanStartedAt: row.scan_started_at ? row.scan_started_at.toISOString() : null,
    scanCompletedAt: row.scan_completed_at ? row.scan_completed_at.toISOString() : null,
    scanError: row.scan_error ?? null,
  };
}

export async function insertAttachment(params: {
  ownerType: string;
  ownerId: string;
  filePath: string;
  fileName: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  checksum?: string | null;
  uploadedBy?: string | null;
  scanStatus: AttachmentScanStatus;
  scanSignature?: string | null;
  scanEngine?: string | null;
  scanStartedAt?: string | null;
  scanCompletedAt?: string | null;
  scanError?: string | null;
}): Promise<AttachmentRecord> {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `insert into attachments (
         owner_type, owner_id, file_path, file_name, mime_type, size_bytes, checksum, uploaded_by,
         scan_status, scan_signature, scan_engine, scan_started_at, scan_completed_at, scan_error
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       returning *`,
      [
        params.ownerType,
        params.ownerId,
        params.filePath,
        params.fileName,
        params.mimeType ?? null,
        params.sizeBytes ?? null,
        params.checksum ?? null,
        params.uploadedBy ?? null,
        params.scanStatus,
        params.scanSignature ?? null,
        params.scanEngine ?? null,
        params.scanStartedAt ? new Date(params.scanStartedAt) : null,
        params.scanCompletedAt ? new Date(params.scanCompletedAt) : null,
        params.scanError ?? null,
      ],
    );

    return mapAttachment(rows[0]);
  });
}

export async function listAttachments(params: {
  ownerType?: string;
  ownerId?: string;
}): Promise<AttachmentRecord[]> {
  const values: unknown[] = [];
  const conditions: string[] = [];

  if (params.ownerType) {
    values.push(params.ownerType);
    conditions.push(`owner_type = $${values.length}`);
  }

  if (params.ownerId) {
    values.push(params.ownerId);
    conditions.push(`owner_id = $${values.length}`);
  }

  const whereClause = conditions.length > 0 ? `where ${conditions.join(' and ')}` : '';

  const { rows } = await query(
    `select * from attachments
      ${whereClause}
      order by created_at desc`,
    values,
  );

  return rows.map(mapAttachment);
}

export async function getAttachmentById(id: string): Promise<AttachmentRecord | null> {
  const { rows } = await query('select * from attachments where id = $1', [id]);
  if (rows.length === 0) {
    return null;
  }

  return mapAttachment(rows[0]);
}

export async function deleteAttachment(id: string): Promise<AttachmentRecord> {
  return withTransaction(async (client) => {
    const existing = await client.query('select * from attachments where id = $1', [id]);
    if (existing.rowCount === 0) {
      throw new NotFoundError('Attachment not found');
    }

    await client.query('delete from attachments where id = $1', [id]);
    return mapAttachment(existing.rows[0]);
  });
}
