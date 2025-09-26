'use client';

import useSWR from 'swr';
import { fetchJson } from '../lib/api';
import { useSession } from './useSession';
import type { TimelineEvent } from '../types/timeline';

type UseTimelineEntriesParams = {
  beneficiaryId?: string | null;
  limit?: number;
  offset?: number;
};

export function useTimelineEntries({ beneficiaryId, limit = 25, offset = 0 }: UseTimelineEntriesParams) {
  const session = useSession();
  const key = session && beneficiaryId
    ? ['beneficiaries:timeline', beneficiaryId, limit, offset, session.token]
    : null;

  const { data, error, isLoading, mutate } = useSWR<TimelineEvent[]>(
    key,
    ([, id, size, start, token]) =>
      fetchJson(
        `/beneficiaries/${id}/timeline`,
        { limit: size, offset: start },
        token,
      ).then((res) => (Array.isArray(res?.data) ? (res.data as TimelineEvent[]) : [])),
    { keepPreviousData: true },
  );

  return {
    timeline: data ?? [],
    error,
    isLoading,
    mutate,
  };
}
