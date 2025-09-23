'use client';

import useSWR from 'swr';
import { fetchJson } from '../lib/api';
import { useSession } from './useSession';

export type ProjectOption = {
  id: string;
  name: string;
};

export function useProjects() {
  const session = useSession();
  const key = session ? ['projects', session.token] : null;
  const { data } = useSWR<{ data: ProjectOption[] }>(key, ([, token]) => fetchJson('/projects', {}, token));
  return data?.data ?? [];
}

export type CohortOption = {
  id: string;
  code: string | null;
};

export function useCohorts(projectId?: string) {
  const session = useSession();
  const key = session && projectId ? ['cohorts', projectId, session.token] : null;
  const { data } = useSWR<{ data: CohortOption[] }>(key, ([, proj, token]) => fetchJson(`/projects/${proj}/cohorts`, {}, token));
  return data?.data ?? [];
}
