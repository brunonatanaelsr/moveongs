'use client';

import useSWR from 'swr';
import type { AttendanceRecord } from '../types/operations';
import { fetchJson } from '../lib/api';
import { useSession } from './useSession';

interface ApiCollection<T> {
  data: T;
}

export interface EnrollmentSummary {
  id: string;
  projectId: string;
  cohortId: string;
  startDate: string;
  status: 'ativa' | 'pendente' | 'aguardando' | 'concluida' | 'desligada';
  agreementsAccepted?: boolean;
  beneficiary: {
    id: string;
    name: string;
  };
}

export function useEnrollments(projectId?: string) {
  const session = useSession();
  const key = session ? ['enrollments', projectId ?? 'all', session.token] : null;
  const swr = useSWR<ApiCollection<EnrollmentSummary[]>>(
    key,
    ([, project, token]) =>
      fetchJson('/enrollments', project === 'all' ? {} : { projectId: project }, token) as Promise<
        ApiCollection<EnrollmentSummary[]>
      >,
  );

  return {
    enrollments: swr.data?.data ?? [],
    isLoading: swr.isLoading,
    error: swr.error,
    mutateEnrollments: swr.mutate,
  };
}

export type AttendanceMap = Record<string, AttendanceRecord[]>;

export function useAttendance(enrollmentIds: string[]) {
  const session = useSession();
  const sortedIds = [...enrollmentIds].sort();
  const key = session && sortedIds.length > 0 ? ['attendance', sortedIds.join(','), session.token] : null;

  const swr = useSWR<AttendanceMap>(
    key,
    async ([, joinedIds, token]) => {
      const ids = joinedIds.split(',');
      if (ids.length === 0) {
        return {} as AttendanceMap;
      }

      const responses = await Promise.all(
        ids.map(async (enrollmentId) => {
          const result = (await fetchJson(`/enrollments/${enrollmentId}/attendance`, {}, token)) as ApiCollection<
            AttendanceRecord[]
          >;
          return [enrollmentId, result.data] as const;
        }),
      );

      return Object.fromEntries(responses) as AttendanceMap;
    },
    {
      fallbackData: {},
    },
  );

  return {
    attendanceByEnrollment: swr.data ?? {},
    isLoading: swr.isLoading,
    error: swr.error,
    mutateAttendance: swr.mutate,
  };
}
