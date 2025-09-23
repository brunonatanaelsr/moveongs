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

export type NotificationEvent =
  | EnrollmentCreatedEvent
  | AttendanceRecordedEvent
  | ConsentRecordedEvent
  | ConsentUpdatedEvent;

export type NotificationChannel = 'email' | 'whatsapp' | 'webhook';

