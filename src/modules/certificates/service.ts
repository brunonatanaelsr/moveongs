import { AppError, ForbiddenError } from '../../shared/errors';
import { saveFile, readFile } from '../attachments/storage';
import { getEnrollmentById } from '../enrollments/repository';
import { ATTENDANCE_MINIMUM_RATE } from '../enrollments/service';
import {
  CertificateRecord,
  getCertificateById,
  insertCertificate,
  listCertificates as listCertificatesRepository,
} from './repository';

const DEFAULT_CERTIFICATE_TYPE = 'completion';

export type IssueCertificateParams = {
  enrollmentId: string;
  issuedBy?: string | null;
  type?: string;
  metadata?: Record<string, unknown> | null;
};

export async function issueCertificate(
  params: IssueCertificateParams & { allowedProjectIds?: string[] | null },
): Promise<CertificateRecord> {
  const scopes = params.allowedProjectIds && params.allowedProjectIds.length > 0 ? params.allowedProjectIds : null;
  const enrollment = await getEnrollmentById(params.enrollmentId, scopes);
  if (!enrollment) {
    throw new AppError('Enrollment not found', 404);
  }

  const attendance = enrollment.attendance ?? { totalSessions: 0, presentSessions: 0, attendanceRate: null };
  const totalSessions = Number(attendance.totalSessions ?? 0);
  const presentSessions = Number(attendance.presentSessions ?? 0);
  const attendanceRate = attendance.attendanceRate === null || attendance.attendanceRate === undefined
    ? null
    : Number(attendance.attendanceRate);

  if (totalSessions === 0 || attendanceRate === null) {
    throw new AppError('Enrollment does not have attendance records to evaluate eligibility', 422);
  }

  if (attendanceRate < ATTENDANCE_MINIMUM_RATE) {
    throw new AppError('Minimum attendance not reached for certificate issuance', 422);
  }

  const issuedAt = new Date();
  const certificateType = params.type?.trim() || DEFAULT_CERTIFICATE_TYPE;

  const metadata = {
    beneficiaryId: enrollment.beneficiaryId,
    beneficiaryName: enrollment.beneficiaryName,
    cohortId: enrollment.cohortId,
    cohortCode: enrollment.cohortCode,
    projectId: enrollment.projectId,
    projectName: enrollment.projectName,
    issuedAt: issuedAt.toISOString(),
    attendanceRate,
    totalSessions,
    presentSessions,
    ...(params.metadata ?? {}),
  } satisfies Record<string, unknown>;

  const pdfBuffer = createCertificatePdf({
    beneficiaryName: enrollment.beneficiaryName,
    projectName: enrollment.projectName,
    cohortCode: enrollment.cohortCode,
    attendanceRate,
    totalSessions,
    presentSessions,
    issuedAt,
    certificateType,
  });

  const safeFileName = buildCertificateFileName(enrollment.beneficiaryName, issuedAt);
  const saved = await saveFile(pdfBuffer, safeFileName);

  return insertCertificate({
    enrollmentId: enrollment.id,
    type: certificateType,
    issuedBy: params.issuedBy ?? null,
    totalSessions,
    presentSessions,
    attendanceRate,
    filePath: saved.filePath,
    fileName: saved.fileName,
    mimeType: 'application/pdf',
    metadata,
  });
}

export async function listCertificates(params: {
  enrollmentId?: string;
  beneficiaryId?: string;
  projectId?: string;
  cohortId?: string;
  limit?: number;
  offset?: number;
  allowedProjectIds?: string[] | null;
}): Promise<CertificateRecord[]> {
  const limit = Math.min(params.limit ?? 50, 200);
  const offset = params.offset ?? 0;

  if (limit < 1) {
    throw new AppError('limit must be positive', 400);
  }

  if (offset < 0) {
    throw new AppError('offset cannot be negative', 400);
  }

  const scopes = params.allowedProjectIds && params.allowedProjectIds.length > 0 ? params.allowedProjectIds : null;

  if (scopes && params.projectId && !scopes.includes(params.projectId)) {
    throw new ForbiddenError('Project access denied');
  }

  return listCertificatesRepository({
    enrollmentId: params.enrollmentId,
    beneficiaryId: params.beneficiaryId,
    projectId: params.projectId,
    cohortId: params.cohortId,
    limit,
    offset,
    allowedProjectIds: scopes,
  });
}

export async function getCertificateOrFail(
  id: string,
  allowedProjectIds?: string[] | null,
): Promise<CertificateRecord> {
  const certificate = await getCertificateById(id, allowedProjectIds ?? null);
  if (!certificate) {
    throw new AppError('Certificate not found', 404);
  }
  return certificate;
}

export async function loadCertificateFile(
  id: string,
  allowedProjectIds?: string[] | null,
): Promise<{ metadata: CertificateRecord; buffer: Buffer }> {
  const metadata = await getCertificateOrFail(id, allowedProjectIds ?? null);
  const buffer = await readFile(metadata.filePath);
  return { metadata, buffer };
}

function buildCertificateFileName(beneficiaryName: string, issuedAt: Date): string {
  const slug = beneficiaryName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 40);
  const datePart = issuedAt.toISOString().slice(0, 10);
  const base = slug.length > 0 ? slug : 'beneficiaria';
  return `${base}-certificado-${datePart}.pdf`;
}

function createCertificatePdf(params: {
  beneficiaryName: string;
  projectName: string;
  cohortCode: string | null;
  attendanceRate: number;
  totalSessions: number;
  presentSessions: number;
  issuedAt: Date;
  certificateType: string;
}): Buffer {
  const lines = [
    'Certificado de Participação',
    `Beneficiária: ${params.beneficiaryName}`,
    `Projeto: ${params.projectName}`,
    `Turma: ${params.cohortCode ?? 'Não informado'}`,
    `Presença: ${params.presentSessions} de ${params.totalSessions} encontros (${formatPercentage(params.attendanceRate)})`,
    `Emitido em: ${params.issuedAt.toISOString().slice(0, 10)}`,
    `Tipo: ${params.certificateType}`,
  ];

  return buildPdfFromLines(lines);
}

function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function buildPdfFromLines(lines: string[]): Buffer {
  const header = Buffer.from('%PDF-1.4\n', 'utf8');

  const contentStream = lines
    .map((line, index) => `BT /F1 14 Tf 72 ${720 - index * 28} Td (${escapePdfText(line)}) Tj ET`)
    .join('\n');

  const contentBuffer = Buffer.from(contentStream, 'utf8');

  const objects = [
    Buffer.from('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n', 'utf8'),
    Buffer.from('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n', 'utf8'),
    Buffer.from('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n', 'utf8'),
    Buffer.from('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n', 'utf8'),
    Buffer.from(`5 0 obj\n<< /Length ${contentBuffer.length} >>\nstream\n${contentStream}\nendstream\nendobj\n`, 'utf8'),
  ];

  let offset = header.length;
  const offsets = objects.map((object) => {
    const current = offset;
    offset += object.length;
    return current;
  });

  const xrefOffset = offset;
  const xrefEntries = offsets
    .map((value) => `${value.toString().padStart(10, '0')} 00000 n \n`)
    .join('');
  const xref = Buffer.from(`xref\n0 6\n0000000000 65535 f \n${xrefEntries}`, 'utf8');
  const trailer = Buffer.from(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`, 'utf8');

  return Buffer.concat([header, ...objects, xref, trailer]);
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}
