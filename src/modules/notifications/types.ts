type NotificationEventBase = {
  id?: string;
  triggeredAt?: string;
};

export type EnrollmentCreatedEvent = NotificationEventBase & {
  type: 'enrollment.created';
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

export type AttendanceRecordedEvent = NotificationEventBase & {
  type: 'attendance.recorded';
  data: {
    attendanceId: string;
    enrollmentId: string;
    date: string;
    present: boolean;
    justification: string | null;
  };
};

export type AttendanceLowAttendanceEvent = NotificationEventBase & {
  type: 'attendance.low_attendance';
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

export type ConsentRecordedEvent = NotificationEventBase & {
  type: 'consent.recorded';
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

export type ConsentUpdatedEvent = NotificationEventBase & {
  type: 'consent.updated';
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

export type ActionItemDueSoonEvent = NotificationEventBase & {
  type: 'action_item.due_soon';
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

export type ActionItemOverdueEvent = NotificationEventBase & {
  type: 'action_item.overdue';
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

export type PasswordResetRequestedEvent = NotificationEventBase & {
  type: 'auth.password_reset_requested';
  data: {
    email: string;
    name: string;
    resetUrl: string;
    expiresAt: string;
  };
};

export type NotificationEvent =
  | EnrollmentCreatedEvent
  | AttendanceRecordedEvent
  | AttendanceLowAttendanceEvent
  | ConsentRecordedEvent
  | ConsentUpdatedEvent
  | ActionItemDueSoonEvent
  | ActionItemOverdueEvent
  | PasswordResetRequestedEvent;

export type NotificationChannel = 'email' | 'whatsapp' | 'webhook';
