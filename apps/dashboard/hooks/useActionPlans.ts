'use client';

import useSWR from 'swr';
import { fetchJson } from '../lib/api';
import { useSession } from './useSession';
import type { ActionPlan } from '../types/action-plans';
import type { BeneficiarySummary } from '../types/beneficiaries';

export function useBeneficiaries(limit = 10) {
  const session = useSession();
  const key = session ? ['beneficiaries', limit, session.token] : null;
  const { data, error, isLoading, mutate } = useSWR<BeneficiarySummary[]>(key, ([, size, token]) =>
    fetchJson('/beneficiaries', { limit: size }, token).then((res) =>
      Array.isArray(res?.data) ? (res.data as BeneficiarySummary[]) : [],
    ),
  );

  return {
    beneficiaries: data ?? [],
    error,
    isLoading,
    mutate,
  };
}

export function useActionPlans(beneficiaryId?: string | null, params?: { status?: string }) {
  const session = useSession();
  const key = session && beneficiaryId
    ? ['action-plans', beneficiaryId, params?.status ?? null, session.token]
    : null;
  const { data, error, isLoading, mutate } = useSWR<ActionPlan[]>(
    key,
    ([, id, status, token]) =>
      fetchJson(`/beneficiaries/${id}/action-plans`, status ? { status } : {}, token).then((res) =>
        Array.isArray(res?.data) ? (res.data as ActionPlan[]) : [],
      ),
  );

  return {
    plans: data ?? [],
    error,
    isLoading,
    mutate,
  };
}
