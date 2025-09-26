'use client';

import useSWR from 'swr';
import { fetchJson } from '../lib/api';
import { useSession } from './useSession';
import type { FormSubmissionSummary } from '../types/forms';

type UseBeneficiaryFormsParams = {
  beneficiaryId?: string | null;
  formType?: string;
  limit?: number;
  offset?: number;
};

export function useBeneficiaryForms({ beneficiaryId, formType, limit = 25, offset = 0 }: UseBeneficiaryFormsParams) {
  const session = useSession();
  const key = session && beneficiaryId
    ? ['beneficiaries:forms', beneficiaryId, formType ?? null, limit, offset, session.token]
    : null;

  const { data, error, isLoading, mutate } = useSWR<FormSubmissionSummary[]>(
    key,
    ([, id, type, size, start, token]) =>
      fetchJson(
        `/beneficiaries/${id}/forms`,
        {
          formType: type ?? undefined,
          limit: size,
          offset: start,
        },
        token,
      ).then((res) => (Array.isArray(res?.data) ? (res.data as FormSubmissionSummary[]) : [])),
    { keepPreviousData: true },
  );

  return {
    submissions: data ?? [],
    error,
    isLoading,
    mutate,
  };
}
