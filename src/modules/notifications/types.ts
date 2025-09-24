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

export type ConsentReviewDueEvent = {
  type: 'consent.review_due';
  triggeredAt?: string;
  data: {
    consentId: string;
    beneficiaryId: string;
    dueAt: string;
    taskId: string;
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

export type PasswordResetRequestedEvent = {
  type: 'auth.password_reset_requested';
  triggeredAt?: string;
  data: {
    email: string;
    name: string;
    resetUrl: string;
    expiresAt: string;
  };
};

export type AuthMfaUpdatedEvent = {
  type: 'auth.mfa_updated';
  triggeredAt?: string;
  data: {
    userId: string;
    method: 'totp' | 'webauthn';
    status: 'enabled' | 'disabled';
  };
};

export type PrivacyDsrCreatedEvent = {
  type: 'privacy.dsr_created';
  triggeredAt?: string;
  data: {
    requestId: string;
    beneficiaryId: string;
    dueAt: string;
  };
};

export type PrivacyDsrCompletedEvent = {
  type: 'privacy.dsr_completed';
  triggeredAt?: string;
  data: {
    requestId: string;
    beneficiaryId: string;
    completedAt: string;
    slaBreached: boolean;
  };
};

export type PrivacyDsrDueSoonEvent = {
  type: 'privacy.dsr_due_soon';
  triggeredAt?: string;
  data: {
    requestId: string;
    beneficiaryId: string;
    dueAt: string;
  };
};

export type PrivacyDsrSlaBreachedEvent = {
  type: 'privacy.dsr_sla_breached';
  triggeredAt?: string;
  data: {
    requestId: string;
    beneficiaryId: string;
    dueAt: string;
  };
};

export type NotificationEvent =
  | EnrollmentCreatedEvent
  | AttendanceRecordedEvent
  | AttendanceLowAttendanceEvent
  | ConsentRecordedEvent
  | ConsentUpdatedEvent
  | ConsentReviewDueEvent
  | ActionItemDueSoonEvent
  | ActionItemOverdueEvent
  | PasswordResetRequestedEvent
  | AuthMfaUpdatedEvent
  | PrivacyDsrCreatedEvent
  | PrivacyDsrCompletedEvent
  | PrivacyDsrDueSoonEvent
  | PrivacyDsrSlaBreachedEvent;

export type NotificationChannel = 'email' | 'whatsapp' | 'webhook';

