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
  slug?: string | null;
  active?: boolean;
};

export type CohortRecord = {
  id: string;
  projectId: string;
  name: string;
  schedule: string | null;
  capacity: number | null;
  location: string | null;
  educator: string | null;
  code?: string | null;
  weekday?: number | null;
  shift?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  educators?: Array<{ id: string; name: string | null }>;
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
  beneficiaryName?: string;
  cohortCode?: string | null;
  projectId?: string;
  projectName?: string;
  enrolledAt?: string | null;
  terminatedAt?: string | null;
  terminationReason?: string | null;
  agreementAcceptance?: Record<string, unknown> | null;
  attendance?: {
    totalSessions: number;
    presentSessions: number;
    attendanceRate: number | null;
  };
};

export type EnrollmentListResponse = {
  data: EnrollmentRecord[];
  meta: PaginationMeta;
};

export type ActionPlanItemRecord = {
  id: string;
  actionPlanId: string;
  title: string;
  responsible: string | null;
  dueDate: string | null;
  status: string;
  support: string | null;
  notes: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ActionPlanRecord = {
  id: string;
  beneficiaryId: string;
  status: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  items: ActionPlanItemRecord[];
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
  const data = Array.isArray(response?.data) ? (response.data as any[]) : [];
  return data.map((project) => ({
    id: project.id as string,
    name: project.name as string,
    description: (project.description ?? null) as string | null,
    focus: (project.focus ?? null) as string | null,
    status: project.active === false ? 'inativo' : 'ativo',
    capacity: (project.capacity ?? null) as number | null,
    createdAt: (project.createdAt ?? project.created_at ?? new Date().toISOString()) as string,
    updatedAt: (project.updatedAt ?? project.updated_at ?? new Date().toISOString()) as string,
    slug: (project.slug ?? null) as string | null,
    active: project.active ?? undefined,
  }));
}

export async function listProjectCohorts(projectId: string, token?: string | null) {
  if (!projectId) {
    return [] as CohortRecord[];
  }
  const response = await fetchJson(`/projects/${projectId}/cohorts`, {}, token);
  const data = Array.isArray(response?.data) ? (response.data as any[]) : [];
  return data.map((cohort) => {
    const educatorNames = Array.isArray(cohort.educators)
      ? cohort.educators
          .map((educator: any) => educator?.name)
          .filter((name: unknown): name is string => typeof name === 'string' && name.length > 0)
          .join(', ')
      : null;

    const timeRange = cohort.startTime && cohort.endTime ? `${cohort.startTime} - ${cohort.endTime}` : null;
    const scheduleParts = [cohort.shift ?? null, timeRange].filter(Boolean);

    return {
      id: cohort.id as string,
      projectId: cohort.projectId as string,
      name: (cohort.name ?? cohort.code ?? 'Turma') as string,
      schedule: scheduleParts.length > 0 ? scheduleParts.join(' • ') : null,
      capacity: (cohort.capacity ?? null) as number | null,
      location: (cohort.location ?? null) as string | null,
      educator: educatorNames,
      code: (cohort.code ?? null) as string | null,
      weekday: (cohort.weekday ?? null) as number | null,
      shift: (cohort.shift ?? null) as string | null,
      startTime: (cohort.startTime ?? null) as string | null,
      endTime: (cohort.endTime ?? null) as string | null,
      educators: Array.isArray(cohort.educators)
        ? cohort.educators.map((item: any) => ({ id: item?.id as string, name: item?.name ?? null }))
        : [],
    } as CohortRecord;
  });
}

export async function listEnrollments(params: PaginationParams & { projectId?: string; cohortId?: string }, token?: string | null) {
  const response = await fetchJson('/enrollments', params, token);
  const rawData = Array.isArray(response?.data) ? (response.data as any[]) : [];
  const data = rawData.map((item) => ({
    id: item.id as string,
    beneficiaryId: item.beneficiaryId as string,
    cohortId: item.cohortId as string,
    status: item.status as string,
    startDate: (item.enrolledAt ?? null) as string | null,
    endDate: (item.terminatedAt ?? null) as string | null,
    disengagementReason: (item.terminationReason ?? null) as string | null,
    agreementsAccepted: item.agreementAcceptance ? true : null,
    createdAt: (item.createdAt ?? new Date().toISOString()) as string,
    updatedAt: (item.updatedAt ?? new Date().toISOString()) as string,
    beneficiaryName: item.beneficiaryName ?? undefined,
    cohortCode: item.cohortCode ?? null,
    projectId: item.projectId ?? undefined,
    projectName: item.projectName ?? undefined,
    enrolledAt: item.enrolledAt ?? null,
    terminatedAt: item.terminatedAt ?? null,
    terminationReason: item.terminationReason ?? null,
    agreementAcceptance: item.agreementAcceptance ?? null,
    attendance: item.attendance ?? undefined,
  }) as EnrollmentRecord);
  const meta = (response?.meta as PaginationMeta | undefined) ?? {
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
    count: data.length,
  };
  return { data, meta };
}

export async function createEnrollment(
  payload: { beneficiaryId: string; cohortId: string; enrolledAt?: string; status?: string },
  token?: string | null,
) {
  const response = await requestJson(
    '/enrollments',
    {
      method: 'POST',
      body: {
        beneficiaryId: payload.beneficiaryId,
        cohortId: payload.cohortId,
        enrolledAt: payload.enrolledAt,
        status: payload.status,
      },
    },
    token,
  );
  return response?.enrollment as EnrollmentRecord | undefined;
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

export async function listActionPlans(
  beneficiaryId: string,
  params: { status?: string } = {},
  token?: string | null,
) {
  if (!beneficiaryId) {
    return [] as ActionPlanRecord[];
  }
  const response = await fetchJson(`/beneficiaries/${beneficiaryId}/action-plans`, params, token);
  const data = Array.isArray(response?.data) ? (response.data as any[]) : [];
  return data.map((plan) => ({
    ...plan,
    items: Array.isArray(plan.items) ? plan.items : [],
  })) as ActionPlanRecord[];
}

export async function createActionPlan(
  payload: { beneficiaryId: string; status?: string },
  token?: string | null,
) {
  const response = await requestJson(
    '/action-plans',
    {
      method: 'POST',
      body: payload,
    },
    token,
  );
  const plan = response?.plan as ActionPlanRecord | undefined;
  if (!plan) return undefined;
  return { ...plan, items: Array.isArray(plan.items) ? plan.items : [] };
}

export async function createActionPlanItem(
  actionPlanId: string,
  payload: {
    title: string;
    responsible?: string | null;
    dueDate?: string | null;
    status?: string;
    support?: string | null;
    notes?: string | null;
  },
  token?: string | null,
) {
  const response = await requestJson(
    `/action-plans/${actionPlanId}/items`,
    {
      method: 'POST',
      body: payload,
    },
    token,
  );
  const plan = response?.plan as ActionPlanRecord | undefined;
  if (!plan) return undefined;
  return { ...plan, items: Array.isArray(plan.items) ? plan.items : [] };
}

export async function updateActionPlanItem(
  actionPlanId: string,
  itemId: string,
  payload: {
    title?: string;
    responsible?: string | null;
    dueDate?: string | null;
    status?: string;
    support?: string | null;
    notes?: string | null;
    completedAt?: string | null;
  },
  token?: string | null,
) {
  const response = await requestJson(
    `/action-plans/${actionPlanId}/items/${itemId}`,
    {
      method: 'PATCH',
      body: payload,
    },
    token,
  );
  const plan = response?.plan as ActionPlanRecord | undefined;
  if (!plan) return undefined;
  return { ...plan, items: Array.isArray(plan.items) ? plan.items : [] };
}
