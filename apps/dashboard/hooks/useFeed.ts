'use client';

import useSWR from 'swr';
import { fetchJson } from '../lib/api';
import { useSession } from './useSession';
import type { FeedPost } from '../types/feed';

export function useFeedPosts(params?: { projectId?: string | null; limit?: number }) {
  const session = useSession();
  const key = session ? ['feed-posts', params?.projectId ?? null, params?.limit ?? 10, session.token] : null;
  const { data, error, isLoading, mutate } = useSWR<FeedPost[]>(key, ([, projectId, limit, token]) =>
    fetchJson(
      '/feed/posts',
      {
        projectId: projectId ?? undefined,
        limit: limit ?? 10,
      },
      token,
    ).then((res) => (Array.isArray(res?.data) ? (res.data as FeedPost[]) : [])),
  );

  return {
    posts: data ?? [],
    error,
    isLoading,
    mutate,
  };
}
