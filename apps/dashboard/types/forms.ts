export type FormAttachment = {
  id?: string;
  fileName?: string | null;
  url?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  [key: string]: unknown;
};

export type FormSubmissionSummary = {
  id: string;
  beneficiaryId: string;
  beneficiaryName: string | null;
  formType: string;
  schemaVersion: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
};

export type FormSubmissionRecord = FormSubmissionSummary & {
  payload: Record<string, unknown>;
  signedBy: string[];
  signedAt: string[];
  attachments: FormAttachment[];
};
