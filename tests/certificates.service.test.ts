import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../src/shared/errors';
import { ATTENDANCE_MINIMUM_RATE } from '../src/modules/enrollments/service';
import { issueCertificate } from '../src/modules/certificates/service';

type EnrollmentRecordMock = {
  id: string;
  beneficiaryId: string;
  beneficiaryName: string;
  cohortId: string;
  cohortCode: string | null;
  projectId: string;
  projectName: string;
  attendance: {
    totalSessions: number;
    presentSessions: number;
    attendanceRate: number | null;
  };
};

const {
  getEnrollmentByIdMock,
  insertCertificateMock,
  saveFileMock,
} = vi.hoisted(() => ({
  getEnrollmentByIdMock: vi.fn(),
  insertCertificateMock: vi.fn(),
  saveFileMock: vi.fn(),
}));

vi.mock('../src/modules/enrollments/repository', () => ({
  getEnrollmentById: getEnrollmentByIdMock,
}));

vi.mock('../src/modules/certificates/repository', () => ({
  insertCertificate: insertCertificateMock,
  getCertificateById: vi.fn(),
  listCertificates: vi.fn(),
}));

vi.mock('../src/modules/attachments/storage', () => ({
  saveFile: saveFileMock,
  readFile: vi.fn(),
}));

describe('certificate service', () => {
  const enrollment: EnrollmentRecordMock = {
    id: 'enr-eligible',
    beneficiaryId: 'ben-1',
    beneficiaryName: 'Maria de Teste',
    cohortId: 'cohort-1',
    cohortCode: 'TURMA-A',
    projectId: 'proj-1',
    projectName: 'Projeto Teste',
    attendance: {
      totalSessions: 20,
      presentSessions: 18,
      attendanceRate: 0.9,
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    getEnrollmentByIdMock.mockResolvedValue(enrollment);
    saveFileMock.mockResolvedValue({ filePath: '/tmp/cert.pdf', fileName: 'cert.pdf' });
    insertCertificateMock.mockResolvedValue({
      id: 'cert-1',
      enrollmentId: enrollment.id,
      type: 'completion',
      issuedAt: new Date('2024-07-15T12:00:00.000Z').toISOString(),
      issuedBy: 'user-1',
      issuedByName: 'User Example',
      totalSessions: enrollment.attendance.totalSessions,
      presentSessions: enrollment.attendance.presentSessions,
      attendanceRate: enrollment.attendance.attendanceRate,
      filePath: '/tmp/cert.pdf',
      fileName: 'cert.pdf',
      mimeType: 'application/pdf',
      metadata: null,
      createdAt: new Date('2024-07-15T12:00:00.000Z').toISOString(),
      beneficiaryId: enrollment.beneficiaryId,
      beneficiaryName: enrollment.beneficiaryName,
      cohortId: enrollment.cohortId,
      cohortCode: enrollment.cohortCode,
      projectId: enrollment.projectId,
      projectName: enrollment.projectName,
    });
  });

  it('throws when enrollment is not found', async () => {
    getEnrollmentByIdMock.mockResolvedValueOnce(null);

    await expect(issueCertificate({ enrollmentId: 'unknown' })).rejects.toBeInstanceOf(AppError);
  });

  it('rejects issuance when there is no attendance history', async () => {
    getEnrollmentByIdMock.mockResolvedValueOnce({
      ...enrollment,
      attendance: { totalSessions: 0, presentSessions: 0, attendanceRate: null },
    });

    await expect(issueCertificate({ enrollmentId: enrollment.id })).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it('rejects issuance when attendance is below threshold', async () => {
    getEnrollmentByIdMock.mockResolvedValueOnce({
      ...enrollment,
      attendance: { totalSessions: 10, presentSessions: 6, attendanceRate: ATTENDANCE_MINIMUM_RATE - 0.1 },
    });

    await expect(issueCertificate({ enrollmentId: enrollment.id })).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it('persists certificate metadata and file when requirements are met', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-07-15T12:00:00.000Z'));

    const result = await issueCertificate({
      enrollmentId: enrollment.id,
      issuedBy: 'user-1',
      metadata: { customNote: 'Parabéns!' },
    });

    expect(saveFileMock).toHaveBeenCalledWith(expect.any(Buffer), expect.stringContaining('certificado'));

    const insertPayload = insertCertificateMock.mock.calls[0][0];
    expect(insertPayload).toMatchObject({
      enrollmentId: enrollment.id,
      issuedBy: 'user-1',
      totalSessions: enrollment.attendance.totalSessions,
      presentSessions: enrollment.attendance.presentSessions,
      attendanceRate: enrollment.attendance.attendanceRate,
      mimeType: 'application/pdf',
    });
    expect(insertPayload.metadata).toMatchObject({
      beneficiaryId: enrollment.beneficiaryId,
      projectId: enrollment.projectId,
      cohortId: enrollment.cohortId,
      attendanceRate: enrollment.attendance.attendanceRate,
      customNote: 'Parabéns!',
      issuedAt: '2024-07-15T12:00:00.000Z',
    });

    expect(result.id).toBe('cert-1');

    vi.useRealTimers();
  });
});
