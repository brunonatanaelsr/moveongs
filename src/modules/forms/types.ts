export type FormTemplateRecord = {
  id: string;
  formType: string;
  schemaVersion: string;
  schema: unknown;
  status: string;
  publishedAt: string | null;
};

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
  template?: FormTemplateRecord | null;
};

export type ListTemplatesFilters = {
  formType?: string;
  status?: string;
};

export type CreateTemplateParams = {
  formType: string;
  schemaVersion: string;
  schema: unknown;
  status?: string;
};

export type UpdateTemplateParams = {
  schema?: unknown;
  status?: string;
};

export type ListSubmissionsFilters = {
  beneficiaryId: string;
  formType?: string;
  limit: number;
  offset: number;
  allowedProjectIds?: string[] | null;
};

export type CreateSubmissionInput = {
  beneficiaryId: string;
  formType: string;
  schemaVersion?: string;
  payload: Record<string, unknown>;
  signedBy?: string[];
  signedAt?: string[];
  attachments?: FormAttachment[];
  createdBy?: string | null;
};

export type CreateSubmissionParams = Omit<CreateSubmissionInput, 'schemaVersion'> & {
  schemaVersion: string;
};

export type UpdateSubmissionParams = {
  payload?: Record<string, unknown>;
  signedBy?: string[] | null;
  signedAt?: string[] | null;
  attachments?: FormAttachment[] | null;
};
