'use client';

import useSWR from 'swr';
import { fetchJson } from '../lib/api';
import { useSession } from './useSession';
import type { MessageThread, ThreadMessage } from '../types/messages';

export function useMessageThreads(scope?: string) {
  const session = useSession();
  const key = session ? ['message-threads', scope ?? null, session.token] : null;
  const { data, error, isLoading, mutate } = useSWR<MessageThread[]>(key, ([, scopeFilter, token]) =>
    fetchJson('/messages/threads', scopeFilter ? { scope: scopeFilter } : {}, token).then((res) =>
      Array.isArray(res?.data) ? (res.data as MessageThread[]) : [],
    ),
  );

  return {
    threads: data ?? [],
    error,
    isLoading,
    mutate,
  };
}

export function useThreadMessages(threadId?: string | null) {
  const session = useSession();
  const key = session && threadId ? ['thread-detail', threadId, session.token] : null;
  const { data, error, isLoading, mutate } = useSWR<{ thread: MessageThread; messages: ThreadMessage[] } | null>(
    key,
    ([, id, token]) => fetchJson(`/messages/threads/${id}`, {}, token) as Promise<{ thread: MessageThread; messages: ThreadMessage[] }>,
  );

  return {
    thread: data?.thread ?? null,
    messages: data?.messages ?? [],
    error,
    isLoading,
    mutate,
  };
}
