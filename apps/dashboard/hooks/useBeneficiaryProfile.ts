'use client';

import useSWR from 'swr';
import { fetchJson } from '../lib/api';
import { useSession } from './useSession';
import type { BeneficiaryProfile, BeneficiarySummary } from '../types/beneficiaries';

type UseBeneficiaryProfileParams = {
  search?: string;
  beneficiaryId?: string | null;
  limit?: number;
};

export function useBeneficiaryProfile({ search, beneficiaryId, limit = 25 }: UseBeneficiaryProfileParams) {
  const session = useSession();

  const listKey = session ? ['beneficiaries:list', search ?? '', limit, session.token] : null;
  const detailKey = session && beneficiaryId ? ['beneficiaries:detail', beneficiaryId, session.token] : null;

  const {
    data: listData,
    error: listError,
    isLoading: listLoading,
    mutate: mutateList,
  } = useSWR<BeneficiarySummary[]>(
    listKey,
    ([, query, size, token]) =>
      fetchJson(
        '/beneficiaries',
        { limit: size, search: query && query.length > 0 ? query : undefined },
        token,
      ).then((res) => (Array.isArray(res?.data) ? (res.data as BeneficiarySummary[]) : [])),
    { keepPreviousData: true },
  );

  const {
    data: detailData,
    error: detailError,
    isLoading: detailLoading,
    mutate: mutateDetail,
  } = useSWR<BeneficiaryProfile | null>(
    detailKey,
    ([, id, token]) =>
      fetchJson(`/beneficiaries/${id}`, {}, token).then((res) =>
        res?.beneficiary ? (res.beneficiary as BeneficiaryProfile) : null,
      ),
    { keepPreviousData: true },
  );

  return {
    beneficiaries: listData ?? [],
    beneficiary: detailData ?? null,
    isLoadingList: listLoading,
    isLoadingDetail: detailLoading,
    listError,
    detailError,
    mutateList,
    mutateDetail,
  };
}
