export type EnrollmentCreatedEvent = {
  type: 'enrollment.created';
  triggeredAt?: string;
  data: {
    enrollmentId: string;
    beneficiaryId: string;
    beneficiaryName: string;
    cohortId: string;
    cohortCode: string | null;
    projectId: string;
    projectName: string;
    status: string;
    enrolledAt: string;
  };
};

export type AttendanceRecordedEvent = {
  type: 'attendance.recorded';
  triggeredAt?: string;
  data: {
    attendanceId: string;
    enrollmentId: string;
    date: string;
    present: boolean;
    justification: string | null;
  };
};

export type AttendanceLowAttendanceEvent = {
  type: 'attendance.low_attendance';
  triggeredAt?: string;
  data: {
    enrollmentId: string;
    beneficiaryId: string;
    beneficiaryName: string;
    cohortId: string;
    cohortCode: string | null;
    projectId: string;
    projectName: string;
    attendanceRate: number;
    threshold: number;
    totalSessions: number;
    presentSessions: number;
  };
};

export type ConsentRecordedEvent = {
  type: 'consent.recorded';
  triggeredAt?: string;
  data: {
    consentId: string;
    beneficiaryId: string;
    type: string;
    textVersion: string;
    granted: boolean;
    grantedAt: string;
    revokedAt: string | null;
  };
};

export type ConsentUpdatedEvent = {
  type: 'consent.updated';
  triggeredAt?: string;
  data: {
    consentId: string;
    beneficiaryId: string;
    type: string;
    textVersion: string;
    granted: boolean;
    grantedAt: string;
    revokedAt: string | null;
  };
};

export type ActionItemDueSoonEvent = {
  type: 'action_item.due_soon';
  triggeredAt?: string;
  data: {
    actionPlanId: string;
    actionItemId: string;
    beneficiaryId: string;
    beneficiaryName: string | null;
    title: string;
    dueDate: string;
    responsible: string | null;
    status: string;
    dueInDays: number;
  };
};

export type ActionItemOverdueEvent = {
  type: 'action_item.overdue';
  triggeredAt?: string;
  data: {
    actionPlanId: string;
    actionItemId: string;
    beneficiaryId: string;
    beneficiaryName: string | null;
    title: string;
    dueDate: string;
    responsible: string | null;
    status: string;
    overdueByDays: number;
  };
};

export type NotificationEvent =
  | EnrollmentCreatedEvent
  | AttendanceRecordedEvent
  | AttendanceLowAttendanceEvent
  | ConsentRecordedEvent
  | ConsentUpdatedEvent
  | ActionItemDueSoonEvent
  | ActionItemOverdueEvent;

export type NotificationChannel = 'email' | 'whatsapp' | 'webhook';

