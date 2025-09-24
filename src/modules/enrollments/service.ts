import { AppError } from '../../shared/errors';
import {
  AttendanceRecord,
  EnrollmentRecord,
  createEnrollment as createEnrollmentRepository,
  getEnrollmentById,
  listAttendance,
  listEnrollments as listEnrollmentsRepository,
  upsertAttendance,
  updateEnrollment as updateEnrollmentRepository,
} from './repository';
import { publishNotificationEvent } from '../notifications/service';

export const ATTENDANCE_MINIMUM_RATE = 0.75;

type AttendanceRiskStatus = 'ok' | 'risk';

export type AttendanceSummary = {
  totalSessions: number;
  presentSessions: number;
  attendanceRate: number | null;
};

export type RecordAttendanceResult = {
  attendance: AttendanceRecord;
  summary: AttendanceSummary;
  risk: {
    status: AttendanceRiskStatus;
    threshold: number;
    attendanceRate: number | null;
    totalSessions: number;
    presentSessions: number;
  };
};

export async function createEnrollment(input: {
  beneficiaryId: string;
  cohortId: string;
  enrolledAt?: string;
  status?: string;
  agreementAcceptance?: Record<string, unknown> | null;
}): Promise<EnrollmentRecord> {
  const enrollment = await createEnrollmentRepository(input);

  publishNotificationEvent({
    type: 'enrollment.created',
    data: {
      enrollmentId: enrollment.id,
      beneficiaryId: enrollment.beneficiaryId,
      beneficiaryName: enrollment.beneficiaryName,
      cohortId: enrollment.cohortId,
      cohortCode: enrollment.cohortCode,
      projectId: enrollment.projectId,
      projectName: enrollment.projectName,
      status: enrollment.status,
      enrolledAt: enrollment.enrolledAt,
    },
  });

  return enrollment;
}

export async function updateEnrollment(id: string, input: {
  status?: string;
  terminatedAt?: string;
  terminationReason?: string | null;
}): Promise<EnrollmentRecord> {
  return updateEnrollmentRepository(id, input);
}

export async function listEnrollments(params: {
  beneficiaryId?: string;
  cohortId?: string;
  projectId?: string;
  status?: string;
  activeOnly?: boolean;
  limit?: number;
  offset?: number;
}): Promise<EnrollmentRecord[]> {
  const limit = Math.min(params.limit ?? 50, 200);
  const offset = params.offset ?? 0;

  if (limit < 1) {
    throw new AppError('limit must be positive', 400);
  }

  if (offset < 0) {
    throw new AppError('offset cannot be negative', 400);
  }

  return listEnrollmentsRepository({
    beneficiaryId: params.beneficiaryId,
    cohortId: params.cohortId,
    projectId: params.projectId,
    status: params.status,
    activeOnly: params.activeOnly,
    limit,
    offset,
  });
}

export async function recordAttendance(input: {
  enrollmentId: string;
  date: string;
  present: boolean;
  justification?: string | null;
  recordedBy?: string | null;
}): Promise<RecordAttendanceResult> {
  const trimmedJustification =
    typeof input.justification === 'string' ? input.justification.trim() : null;
  const normalizedJustification = trimmedJustification && trimmedJustification.length > 0
    ? trimmedJustification
    : null;

  if (!input.present && !normalizedJustification) {
    throw new AppError('Justification is required when marking an absence');
  }

  const enrollment = await getEnrollmentById(input.enrollmentId);
  if (!enrollment) {
    throw new AppError('Enrollment not found', 404);
  }

  if (enrollment.status === 'suspended' || enrollment.status === 'terminated') {
    throw new AppError('Attendance can only be recorded for active enrollments', 400);
  }

  const attendance = await upsertAttendance({
    enrollmentId: input.enrollmentId,
    date: input.date,
    present: input.present,
    justification: normalizedJustification,
    recordedBy: input.recordedBy,
  });

  publishNotificationEvent({
    type: 'attendance.recorded',
    data: {
      attendanceId: attendance.id,
      enrollmentId: attendance.enrollmentId,
      date: attendance.date,
      present: attendance.present,
      justification: attendance.justification,
    },
  });

  const updatedEnrollment = await getEnrollmentById(attendance.enrollmentId);
  if (!updatedEnrollment) {
    throw new AppError('Failed to load enrollment after recording attendance', 500);
  }

  const summary = updatedEnrollment.attendance;
  const attendanceRate = summary.attendanceRate;
  const isRisk = attendanceRate !== null && attendanceRate < ATTENDANCE_MINIMUM_RATE;

  if (isRisk && attendanceRate !== null) {
    publishNotificationEvent({
      type: 'attendance.low_attendance',
      data: {
        enrollmentId: updatedEnrollment.id,
        beneficiaryId: updatedEnrollment.beneficiaryId,
        beneficiaryName: updatedEnrollment.beneficiaryName,
        cohortId: updatedEnrollment.cohortId,
        cohortCode: updatedEnrollment.cohortCode,
        projectId: updatedEnrollment.projectId,
        projectName: updatedEnrollment.projectName,
        attendanceRate,
        threshold: ATTENDANCE_MINIMUM_RATE,
        totalSessions: summary.totalSessions,
        presentSessions: summary.presentSessions,
      },
    });
  }

  return {
    attendance,
    summary,
    risk: {
      status: isRisk ? 'risk' : 'ok',
      threshold: ATTENDANCE_MINIMUM_RATE,
      attendanceRate,
      totalSessions: summary.totalSessions,
      presentSessions: summary.presentSessions,
    },
  };
}

export async function getAttendance(params: {
  enrollmentId: string;
  startDate?: string;
  endDate?: string;
}): Promise<AttendanceRecord[]> {
  return listAttendance(params);
}
