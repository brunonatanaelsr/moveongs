import { AppError } from '../../shared/errors';
import {
  AttendanceRecord,
  EnrollmentRecord,
  createEnrollment as createEnrollmentRepository,
  listAttendance,
  listEnrollments as listEnrollmentsRepository,
  upsertAttendance,
  updateEnrollment as updateEnrollmentRepository,
} from './repository';
import { publishNotificationEvent } from '../notifications/service';

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
}): Promise<AttendanceRecord> {
  const attendance = await upsertAttendance(input);

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

  return attendance;
}

export async function getAttendance(params: {
  enrollmentId: string;
  startDate?: string;
  endDate?: string;
}): Promise<AttendanceRecord[]> {
  return listAttendance(params);
}
