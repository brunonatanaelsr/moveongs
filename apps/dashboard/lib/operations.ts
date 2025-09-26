import { API_URL } from './api';

// Tipos
export interface ActionPlan {
  id: string;
  enrollmentId: string;
  title: string;
  description: string;
  status: ActionPlanStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ActionPlanItem {
  id: string;
  title: string;
  description: string;
  dueDate: string | null;
  status: ActionItemStatus;
  createdAt: string;
  updatedAt: string;
}

export type ActionPlanStatus = 'draft' | 'active' | 'completed' | 'archived';
export type ActionItemStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';

export interface EnrollmentSummary {
  id: string;
  cohortId: string;
  beneficiaryId: string;
  beneficiaryName: string;
  status: EnrollmentStatus;
  createdAt: string;
  updatedAt: string;
}

export type EnrollmentStatus = 
  | 'pending'
  | 'active'
  | 'completed'
  | 'dropped'
  | 'expelled'
  | 'suspended';

// Helpers
async function fetchJson<T = unknown>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}

// Operações
export async function listEnrollments(
  cohortId: string,
  token?: string | null,
): Promise<EnrollmentSummary[]> {
  return fetchJson(`/enrollments/list?cohortId=${cohortId}`, {}, token);
}

export async function updateEnrollmentStatus(
  enrollmentId: string,
  status: EnrollmentStatus,
  token?: string | null,
): Promise<void> {
  await fetchJson(
    `/enrollments/${enrollmentId}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    },
    token,
  );
}

export async function listActionPlans(
  enrollmentId: string,
  token?: string | null,
): Promise<ActionPlan[]> {
  return fetchJson(`/action-plans/list?enrollmentId=${enrollmentId}`, {}, token);
}

export async function createActionPlan(
  data: {
    enrollmentId: string;
    title: string;
    description: string;
  },
  token?: string | null,
): Promise<ActionPlan> {
  return fetchJson(
    '/action-plans',
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
    token,
  );
}

export async function updateActionPlan(
  planId: string,
  data: Partial<{
    title: string;
    description: string;
    status: ActionPlanStatus;
  }>,
  token?: string | null,
): Promise<ActionPlan> {
  return fetchJson(
    `/action-plans/${planId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
    token,
  );
}

export async function listActionItems(
  planId: string,
  token?: string | null,
): Promise<ActionPlanItem[]> {
  return fetchJson(`/action-plans/${planId}/items`, {}, token);
}

export async function createActionItem(
  planId: string,
  data: {
    title: string;
    description: string;
    dueDate?: string | null;
  },
  token?: string | null,
): Promise<ActionPlanItem> {
  return fetchJson(
    `/action-plans/${planId}/items`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
    token,
  );
}

export async function updateActionItem(
  planId: string,
  itemId: string,
  data: Partial<{
    title: string;
    description: string;
    dueDate: string | null;
    status: ActionItemStatus;
  }>,
  token?: string | null,
): Promise<ActionPlanItem> {
  return fetchJson(
    `/action-plans/${planId}/items/${itemId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
    token,
  );
}
