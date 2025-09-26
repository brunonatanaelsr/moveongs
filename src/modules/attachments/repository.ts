import { query, withTransaction } from '../../db';
import { AppError, NotFoundError } from '../../shared/errors';

export type AttachmentScanStatus = 'clean' | 'infected' | 'error' | 'pending';

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
  antivirusScanStatus: AttachmentScanStatus | null;
  antivirusScanSignature: string | null;
  antivirusScanMessage: string | null;
  antivirusScannedAt: string | null;
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
    antivirusScanStatus: row.antivirus_scan_status ?? null,
    antivirusScanSignature: row.antivirus_scan_signature ?? null,
    antivirusScanMessage: row.antivirus_scan_message ?? null,
    antivirusScannedAt: row.antivirus_scanned_at ? row.antivirus_scanned_at.toISOString() : null,
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
  antivirusScanStatus?: AttachmentScanStatus | null;
  antivirusScanSignature?: string | null;
  antivirusScanMessage?: string | null;
  antivirusScannedAt?: Date | string | null;
}): Promise<AttachmentRecord> {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `insert into attachments (
         owner_type, owner_id, file_path, file_name, mime_type, size_bytes, checksum, uploaded_by,
         antivirus_scan_status, antivirus_scan_signature, antivirus_scan_message, antivirus_scanned_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
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
        params.antivirusScanStatus ?? null,
        params.antivirusScanSignature ?? null,
        params.antivirusScanMessage ?? null,
        params.antivirusScannedAt ?? null,
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
