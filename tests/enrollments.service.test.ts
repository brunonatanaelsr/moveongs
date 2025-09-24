import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../src/shared/errors';
import {
  ATTENDANCE_MINIMUM_RATE,
  recordAttendance,
} from '../src/modules/enrollments/service';

type EnrollmentRecordMock = {
  id: string;
  beneficiaryId: string;
  beneficiaryName: string;
  cohortId: string;
  cohortCode: string | null;
  projectId: string;
  projectName: string;
  status: 'active' | 'suspended' | 'terminated';
  attendance: {
    totalSessions: number;
    presentSessions: number;
    attendanceRate: number | null;
  };
};

const { publishNotificationEventMock, upsertAttendanceMock, getEnrollmentByIdMock } = vi.hoisted(() => ({
  publishNotificationEventMock: vi.fn(),
  upsertAttendanceMock: vi.fn(),
  getEnrollmentByIdMock: vi.fn(),
}));

vi.mock('../src/modules/notifications/service', () => ({
  publishNotificationEvent: publishNotificationEventMock,
}));

vi.mock('../src/modules/enrollments/repository', () => ({
  createEnrollment: vi.fn(),
  listAttendance: vi.fn(),
  listEnrollments: vi.fn(),
  upsertAttendance: upsertAttendanceMock,
  updateEnrollment: vi.fn(),
  getEnrollmentById: getEnrollmentByIdMock,
}));

describe('recordAttendance service', () => {
  const enrollment: EnrollmentRecordMock = {
    id: 'enr-1',
    beneficiaryId: 'ben-1',
    beneficiaryName: 'Beneficiária Teste',
    cohortId: 'cohort-1',
    cohortCode: 'TURMA-1',
    projectId: 'proj-1',
    projectName: 'Projeto Teste',
    status: 'active',
    attendance: {
      totalSessions: 1,
      presentSessions: 1,
      attendanceRate: 1,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    upsertAttendanceMock.mockResolvedValue({
      id: 'att-1',
      enrollmentId: enrollment.id,
      date: '2024-06-01',
      present: true,
      justification: null,
      recordedBy: null,
      createdAt: new Date().toISOString(),
    });
    getEnrollmentByIdMock.mockResolvedValue(enrollment);
  });

  it('rejects absences without justification', async () => {
    await expect(
      recordAttendance({
        enrollmentId: enrollment.id,
        date: '2024-06-01',
        present: false,
        justification: null,
      }),
    ).rejects.toBeInstanceOf(AppError);
    expect(upsertAttendanceMock).not.toHaveBeenCalled();
  });

  it('returns attendance summary when within threshold', async () => {
    const result = await recordAttendance({
      enrollmentId: enrollment.id,
      date: '2024-06-01',
      present: true,
      justification: null,
    });

    expect(upsertAttendanceMock).toHaveBeenCalledWith({
      enrollmentId: enrollment.id,
      date: '2024-06-01',
      present: true,
      justification: null,
      recordedBy: undefined,
    });
    expect(result.summary).toEqual(enrollment.attendance);
    expect(result.risk).toEqual({
      status: 'ok',
      threshold: ATTENDANCE_MINIMUM_RATE,
      attendanceRate: enrollment.attendance.attendanceRate,
      totalSessions: enrollment.attendance.totalSessions,
      presentSessions: enrollment.attendance.presentSessions,
    });
    expect(publishNotificationEventMock).toHaveBeenCalledTimes(1);
    expect(publishNotificationEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'attendance.recorded' }),
    );
  });

  it('emits risk alert when attendance falls below threshold', async () => {
    const lowAttendance: EnrollmentRecordMock = {
      ...enrollment,
      attendance: {
        totalSessions: 2,
        presentSessions: 1,
        attendanceRate: 0.5,
      },
    };
    getEnrollmentByIdMock.mockReset();
    getEnrollmentByIdMock
      .mockResolvedValueOnce(enrollment)
      .mockResolvedValueOnce(enrollment)
      .mockResolvedValueOnce(enrollment)
      .mockResolvedValueOnce(lowAttendance);

    await recordAttendance({
      enrollmentId: enrollment.id,
      date: '2024-06-01',
      present: true,
      justification: null,
    });

    publishNotificationEventMock.mockClear();
    upsertAttendanceMock.mockResolvedValueOnce({
      id: 'att-2',
      enrollmentId: enrollment.id,
      date: '2024-06-08',
      present: false,
      justification: 'Sem transporte',
      recordedBy: null,
      createdAt: new Date().toISOString(),
    });

    const result = await recordAttendance({
      enrollmentId: enrollment.id,
      date: '2024-06-08',
      present: false,
      justification: 'Sem transporte',
    });

    expect(result.summary).toEqual(lowAttendance.attendance);
    expect(result.risk).toEqual({
      status: 'risk',
      threshold: ATTENDANCE_MINIMUM_RATE,
      attendanceRate: lowAttendance.attendance.attendanceRate,
      totalSessions: lowAttendance.attendance.totalSessions,
      presentSessions: lowAttendance.attendance.presentSessions,
    });

    expect(publishNotificationEventMock).toHaveBeenCalledTimes(2);
    const [recordedEvent, riskEvent] = publishNotificationEventMock.mock.calls.map((call) => call[0]);
    expect(recordedEvent.type).toBe('attendance.recorded');
    expect(riskEvent.type).toBe('attendance.low_attendance');
    expect(riskEvent.data).toMatchObject({
      enrollmentId: enrollment.id,
      attendanceRate: lowAttendance.attendance.attendanceRate,
      threshold: ATTENDANCE_MINIMUM_RATE,
      totalSessions: lowAttendance.attendance.totalSessions,
      presentSessions: lowAttendance.attendance.presentSessions,
    });
  });

  it('rejects attendance for suspended enrollments', async () => {
    getEnrollmentByIdMock.mockResolvedValueOnce({
      ...enrollment,
      status: 'suspended',
    });

    await expect(
      recordAttendance({
        enrollmentId: enrollment.id,
        date: '2024-06-01',
        present: true,
        justification: null,
      }),
    ).rejects.toBeInstanceOf(AppError);

    expect(upsertAttendanceMock).not.toHaveBeenCalled();
  });

  it('rejects attendance for terminated enrollments', async () => {
    getEnrollmentByIdMock.mockResolvedValueOnce({
      ...enrollment,
      status: 'terminated',
    });

    await expect(
      recordAttendance({
        enrollmentId: enrollment.id,
        date: '2024-06-01',
        present: true,
        justification: null,
      }),
    ).rejects.toBeInstanceOf(AppError);

    expect(upsertAttendanceMock).not.toHaveBeenCalled();
  });
});
