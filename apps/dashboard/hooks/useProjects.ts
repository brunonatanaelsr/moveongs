'use client';

import useSWR from 'swr';
import type { Classroom, ProjectSummary } from '../types/operations';
import { fetchJson } from '../lib/api';
import { useSession } from './useSession';

interface ApiCollection<T> {
  data: T;
}

export function useProjects() {
  const session = useSession();
  const key = session ? ['projects', session.token] : null;
  const swr = useSWR<ApiCollection<ProjectSummary[]>>(
    key,
    ([, token]) => fetchJson('/projects', {}, token) as Promise<ApiCollection<ProjectSummary[]>>,
  );

  return {
    projects: swr.data?.data ?? [],
    isLoading: swr.isLoading,
    error: swr.error,
    mutate: swr.mutate,
  };
}

export function useCohorts(projectId?: string) {
  const session = useSession();
  const key = session && projectId ? ['cohorts', projectId, session.token] : null;
  const swr = useSWR<ApiCollection<Classroom[]>>(
    key,
    ([, proj, token]) => fetchJson(`/projects/${proj}/cohorts`, {}, token) as Promise<ApiCollection<Classroom[]>>,
  );

  return {
    cohorts: swr.data?.data ?? [],
    isLoading: swr.isLoading,
    error: swr.error,
    mutate: swr.mutate,
  };
}
