'use client';

import useSWR from 'swr';
import { fetchJson } from '../lib/api';
import { useSession } from './useSession';
import type { ConsentRecord } from '../types/consents';

type UseBeneficiaryConsentsParams = {
  beneficiaryId?: string | null;
  includeRevoked?: boolean;
  type?: string;
};

export function useBeneficiaryConsents({ beneficiaryId, includeRevoked, type }: UseBeneficiaryConsentsParams) {
  const session = useSession();
  const key = session && beneficiaryId
    ? ['beneficiaries:consents', beneficiaryId, includeRevoked ?? false, type ?? null, session.token]
    : null;

  const { data, error, isLoading, mutate } = useSWR<ConsentRecord[]>(
    key,
    ([, id, includeRevokedParam, consentType, token]) =>
      fetchJson(
        `/beneficiaries/${id}/consents`,
        {
          includeRevoked: includeRevokedParam || undefined,
          type: consentType ?? undefined,
        },
        token,
      ).then((res) => (Array.isArray(res?.data) ? (res.data as ConsentRecord[]) : [])),
    { keepPreviousData: true },
  );

  return {
    consents: data ?? [],
    error,
    isLoading,
    mutate,
  };
}
