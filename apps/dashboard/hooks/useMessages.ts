'use client';

import { useCallback, useState } from 'react';
import useSWR from 'swr';
import { fetchJson, postJson } from '../lib/api';
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
  const { data, error, isLoading, mutate } = useSWR<{ thread: MessageThread | null; messages: ThreadMessage[] } | null>(
    key,
    async ([, id, token]) => {
      const response = await fetchJson(`/messages/threads/${id}/messages`, {}, token);
      const payload = (response as { data?: unknown })?.data ?? response;
      const container = (payload && typeof payload === 'object' ? payload : {}) as {
        thread?: MessageThread | null;
        messages?: unknown;
      };

      const thread = container.thread ?? null;
      const messages = Array.isArray(container.messages)
        ? (container.messages as ThreadMessage[])
        : [];

      return { thread, messages };
    },
  );

  return {
    thread: data?.thread ?? null,
    messages: data?.messages ?? [],
    error,
    isLoading,
    mutate,
  };
}

type PostMessageInput = {
  body: string;
  isConfidential?: boolean;
};

export function usePostMessage(threadId?: string | null) {
  const session = useSession();
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState<Error | null>(null);

  const sendMessage = useCallback(
    async (input: PostMessageInput) => {
      if (!session || !threadId) {
        throw new Error('Thread não selecionada ou usuário não autenticado');
      }

      setStatus('loading');
      setError(null);

      try {
        const response = await postJson(`/messages/threads/${threadId}/messages`, input, session.token);
        setStatus('success');
        return (response as { data?: ThreadMessage })?.data ?? response;
      } catch (err) {
        const parsed = err instanceof Error ? err : new Error('Falha ao enviar mensagem');
        setError(parsed);
        setStatus('error');
        throw parsed;
      }
    },
    [session, threadId],
  );

  const resetStatus = useCallback(() => {
    setStatus('idle');
    setError(null);
  }, []);

  return {
    sendMessage,
    status,
    error,
    isSending: status === 'loading',
    resetStatus,
  };
}
