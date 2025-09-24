import { query } from '../../db';

type RawCertificateRow = {
  id: string;
  enrollment_id: string;
  type: string;
  issued_at: Date;
  issued_by: string | null;
  issued_by_name: string | null;
  total_sessions: number;
  present_sessions: number;
  attendance_rate: string | number | null;
  file_path: string;
  file_name: string;
  mime_type: string;
  metadata: unknown;
  created_at: Date;
  beneficiary_id: string;
  beneficiary_name: string;
  cohort_id: string;
  cohort_code: string | null;
  project_id: string;
  project_name: string;
};

export type CertificateRecord = {
  id: string;
  enrollmentId: string;
  type: string;
  issuedAt: string;
  issuedBy: string | null;
  issuedByName: string | null;
  totalSessions: number;
  presentSessions: number;
  attendanceRate: number | null;
  filePath: string;
  fileName: string;
  mimeType: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  beneficiaryId: string;
  beneficiaryName: string;
  cohortId: string;
  cohortCode: string | null;
  projectId: string;
  projectName: string;
};

function parseJson(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'object') {
    return value as Record<string, unknown>;
  }

  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

function mapCertificateRow(row: RawCertificateRow): CertificateRecord {
  return {
    id: row.id,
    enrollmentId: row.enrollment_id,
    type: row.type,
    issuedAt: row.issued_at.toISOString(),
    issuedBy: row.issued_by,
    issuedByName: row.issued_by_name,
    totalSessions: Number(row.total_sessions ?? 0),
    presentSessions: Number(row.present_sessions ?? 0),
    attendanceRate: row.attendance_rate === null || row.attendance_rate === undefined
      ? null
      : Number(row.attendance_rate),
    filePath: row.file_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    metadata: parseJson(row.metadata),
    createdAt: row.created_at.toISOString(),
    beneficiaryId: row.beneficiary_id,
    beneficiaryName: row.beneficiary_name,
    cohortId: row.cohort_id,
    cohortCode: row.cohort_code,
    projectId: row.project_id,
    projectName: row.project_name,
  };
}

export async function insertCertificate(params: {
  enrollmentId: string;
  type: string;
  issuedBy?: string | null;
  totalSessions: number;
  presentSessions: number;
  attendanceRate: number | null;
  filePath: string;
  fileName: string;
  mimeType: string;
  metadata?: Record<string, unknown> | null;
}): Promise<CertificateRecord> {
  const metadataValue = params.metadata ? JSON.stringify(params.metadata) : null;

  const { rows } = await query<{ id: string }>(
    `insert into certificates (
       enrollment_id,
       type,
       issued_by,
       total_sessions,
       present_sessions,
       attendance_rate,
       file_path,
       file_name,
       mime_type,
       metadata
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning id`,
    [
      params.enrollmentId,
      params.type,
      params.issuedBy ?? null,
      params.totalSessions,
      params.presentSessions,
      params.attendanceRate,
      params.filePath,
      params.fileName,
      params.mimeType,
      metadataValue,
    ],
  );

  return getCertificateById(rows[0].id).then((record) => {
    if (!record) {
      throw new Error('Failed to load certificate after insertion');
    }
    return record;
  });
}

export async function getCertificateById(id: string): Promise<CertificateRecord | null> {
  const { rows } = await query<RawCertificateRow>(
    `select c.*, u.name as issued_by_name,
            e.beneficiary_id,
            b.full_name as beneficiary_name,
            e.cohort_id,
            co.code as cohort_code,
            co.project_id,
            p.name as project_name
       from certificates c
       join enrollments e on e.id = c.enrollment_id
       join beneficiaries b on b.id = e.beneficiary_id
       join cohorts co on co.id = e.cohort_id
       join projects p on p.id = co.project_id
  left join users u on u.id = c.issued_by
      where c.id = $1`,
    [id],
  );

  if (rows.length === 0) {
    return null;
  }

  return mapCertificateRow(rows[0]);
}

export async function listCertificates(params: {
  enrollmentId?: string;
  beneficiaryId?: string;
  projectId?: string;
  cohortId?: string;
  limit: number;
  offset: number;
}): Promise<CertificateRecord[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  if (params.enrollmentId) {
    conditions.push(`c.enrollment_id = $${index++}`);
    values.push(params.enrollmentId);
  }

  if (params.beneficiaryId) {
    conditions.push(`e.beneficiary_id = $${index++}`);
    values.push(params.beneficiaryId);
  }

  if (params.projectId) {
    conditions.push(`co.project_id = $${index++}`);
    values.push(params.projectId);
  }

  if (params.cohortId) {
    conditions.push(`co.id = $${index++}`);
    values.push(params.cohortId);
  }

  const whereClause = conditions.length > 0 ? `where ${conditions.join(' and ')}` : '';

  values.push(params.limit);
  values.push(params.offset);

  const { rows } = await query<RawCertificateRow>(
    `select c.*, u.name as issued_by_name,
            e.beneficiary_id,
            b.full_name as beneficiary_name,
            e.cohort_id,
            co.code as cohort_code,
            co.project_id,
            p.name as project_name
       from certificates c
       join enrollments e on e.id = c.enrollment_id
       join beneficiaries b on b.id = e.beneficiary_id
       join cohorts co on co.id = e.cohort_id
       join projects p on p.id = co.project_id
  left join users u on u.id = c.issued_by
      ${whereClause}
   order by c.issued_at desc
      limit $${index++} offset $${index}`,
    values,
  );

  return rows.map(mapCertificateRow);
}
