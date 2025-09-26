import { fetchJson, requestJson } from './api';

export type PaginationParams = {
  limit?: number;
  offset?: number;
  search?: string;
};

export type PaginationMeta = {
  limit: number;
  offset: number;
  count: number;
};

export type BeneficiarySummary = {
  id: string;
  code: string | null;
  fullName: string;
  birthDate: string | null;
  cpf: string | null;
  phone1: string | null;
  createdAt: string;
  updatedAt: string;
  vulnerabilities: string[];
};

export type HouseholdMember = {
  id: string;
  name: string | null;
  birthDate: string | null;
  works: boolean | null;
  income: string | null;
  schooling: string | null;
  relationship: string | null;
};

export type BeneficiaryRecord = {
  id: string;
  code: string | null;
  fullName: string;
  birthDate: string | null;
  cpf: string | null;
  rg: string | null;
  rgIssuer: string | null;
  rgIssueDate: string | null;
  nis: string | null;
  phone1: string | null;
  phone2: string | null;
  email: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  reference: string | null;
  createdAt: string;
  updatedAt: string;
  householdMembers: HouseholdMember[];
  vulnerabilities: { slug: string; label: string | null }[];
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

export type TimelineEntry = {
  id: string;
  beneficiaryId: string;
  kind: string;
  date: string;
  title: string;
  description: string | null;
  status?: string;
  metadata?: Record<string, unknown>;
};

export type ConsentRecord = {
  id: string;
  beneficiaryId: string;
  type: string;
  textVersion: string;
  granted: boolean;
  grantedAt: string | null;
  revokedAt: string | null;
  evidence: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectRecord = {
  id: string;
  name: string;
  description: string | null;
  focus: string | null;
  status: string;
  capacity: number | null;
  createdAt: string;
  updatedAt: string;
};

export type CohortRecord = {
  id: string;
  projectId: string;
  name: string;
  schedule: string | null;
  capacity: number | null;
  location: string | null;
  educator: string | null;
};

export type EnrollmentRecord = {
  id: string;
  beneficiaryId: string;
  cohortId: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  disengagementReason: string | null;
  agreementsAccepted: boolean | null;
  createdAt: string;
  updatedAt: string;
  beneficiary?: BeneficiarySummary | null;
};

export type EnrollmentListResponse = {
  data: EnrollmentRecord[];
  meta: PaginationMeta;
};

export type AttendanceFormStatus = 'presente' | 'falta_justificada' | 'falta_injustificada' | 'atraso';

export type AttendanceSubmissionPayload = {
  enrollmentId: string;
  beneficiaryId?: string;
  date: string;
  status: AttendanceFormStatus;
  justification?: string;
};

export type AttendanceSubmissionResult = {
  successes: number;
  failures: Array<{ enrollmentId: string; error: Error }>;
};

export async function listBeneficiaries(params: PaginationParams, token?: string | null) {
  const response = await fetchJson('/beneficiaries', params, token);
  const data = Array.isArray(response?.data) ? (response.data as BeneficiarySummary[]) : [];
  const meta = (response?.meta as PaginationMeta | undefined) ?? {
    limit: params.limit ?? 25,
    offset: params.offset ?? 0,
    count: data.length,
  };
  return { data, meta };
}

export async function getBeneficiary(id: string, token?: string | null) {
  if (!id) {
    throw new Error('Beneficiary id is required');
  }
  const response = await fetchJson(`/beneficiaries/${id}`, {}, token);
  return response?.beneficiary as BeneficiaryRecord;
}

export async function listBeneficiaryForms(
  beneficiaryId: string,
  params: { formType?: string } & PaginationParams,
  token?: string | null,
) {
  if (!beneficiaryId) {
    return { data: [] as FormSubmissionSummary[], meta: { limit: params.limit ?? 25, offset: params.offset ?? 0, count: 0 } };
  }
  const response = await fetchJson(`/beneficiaries/${beneficiaryId}/forms`, params, token);
  const data = Array.isArray(response?.data) ? (response.data as FormSubmissionSummary[]) : [];
  const meta = (response?.meta as PaginationMeta | undefined) ?? {
    limit: params.limit ?? 25,
    offset: params.offset ?? 0,
    count: data.length,
  };
  return { data, meta };
}

export async function submitBeneficiaryForm(
  beneficiaryId: string,
  payload: {
    formType: string;
    schemaVersion: string;
    data: Record<string, unknown>;
    signedBy?: string[];
    signedAt?: string[];
  },
  token?: string | null,
) {
  const response = await requestJson(
    `/beneficiaries/${beneficiaryId}/forms`,
    {
      method: 'POST',
      body: {
        formType: payload.formType,
        schemaVersion: payload.schemaVersion,
        payload: payload.data,
        signedBy: payload.signedBy,
        signedAt: payload.signedAt,
      },
    },
    token,
  );
  return response?.submission as { id: string } | undefined;
}

export async function listBeneficiaryTimeline(
  beneficiaryId: string,
  params: PaginationParams,
  token?: string | null,
) {
  if (!beneficiaryId) {
    return { data: [] as TimelineEntry[], meta: { limit: params.limit ?? 25, offset: params.offset ?? 0, count: 0 } };
  }
  const response = await fetchJson(`/beneficiaries/${beneficiaryId}/timeline`, params, token);
  const data = Array.isArray(response?.data) ? (response.data as TimelineEntry[]) : [];
  const meta = (response?.meta as PaginationMeta | undefined) ?? {
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
    count: data.length,
  };
  return { data, meta };
}

export async function listBeneficiaryConsents(beneficiaryId: string, token?: string | null) {
  if (!beneficiaryId) {
    return [] as ConsentRecord[];
  }
  const response = await fetchJson(`/beneficiaries/${beneficiaryId}/consents`, {}, token);
  return Array.isArray(response?.data) ? (response.data as ConsentRecord[]) : [];
}

export async function listProjects(token?: string | null) {
  const response = await fetchJson('/projects', {}, token);
  return Array.isArray(response?.data) ? (response.data as ProjectRecord[]) : [];
}

export async function listProjectCohorts(projectId: string, token?: string | null) {
  if (!projectId) {
    return [] as CohortRecord[];
  }
  const response = await fetchJson(`/projects/${projectId}/cohorts`, {}, token);
  return Array.isArray(response?.data) ? (response.data as CohortRecord[]) : [];
}

export async function listEnrollments(
  params: PaginationParams & { projectId?: string; cohortId?: string; status?: string; activeOnly?: boolean },
  token?: string | null,
) {
  const response = await fetchJson('/enrollments', params, token);
  const data = Array.isArray(response?.data) ? (response.data as EnrollmentRecord[]) : [];
  const meta = (response?.meta as PaginationMeta | undefined) ?? {
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
    count: data.length,
  };
  return { data, meta };
}

export async function updateEnrollment(
  id: string,
  payload: Partial<{ status: string; agreementsAccepted: boolean | null; endDate: string | null }>,
  token?: string | null,
) {
  const response = await requestJson(
    `/enrollments/${id}`,
    {
      method: 'PATCH',
      body: payload,
    },
    token,
  );
  return response?.enrollment as EnrollmentRecord | undefined;
}

export async function submitAttendanceRecords(
  records: AttendanceSubmissionPayload[],
  token?: string | null,
): Promise<AttendanceSubmissionResult> {
  if (records.length === 0) {
    return { successes: 0, failures: [] };
  }

  const settled = await Promise.allSettled(
    records.map((record) => {
      const present = record.status === 'presente' || record.status === 'atraso';
      const justification = record.justification?.trim();
      return recordAttendance(
        record.enrollmentId,
        {
          date: record.date,
          present,
          justification: present && !justification ? null : justification ?? null,
        },
        token,
      );
    }),
  );

  return settled.reduce<AttendanceSubmissionResult>(
    (accumulator, result, index) => {
      if (result.status === 'fulfilled') {
        return { ...accumulator, successes: accumulator.successes + 1 };
      }

      const failure: { enrollmentId: string; error: Error } = {
        enrollmentId: records[index]?.enrollmentId ?? '',
        error: result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
      };

      return { ...accumulator, failures: [...accumulator.failures, failure] };
    },
    { successes: 0, failures: [] },
  );
}

export async function recordAttendance(
  enrollmentId: string,
  payload: { date: string; present: boolean; justification?: string | null },
  token?: string | null,
) {
  return requestJson(
    `/enrollments/${enrollmentId}/attendance`,
    {
      method: 'POST',
      body: payload,
    },
    token,
  );
}
