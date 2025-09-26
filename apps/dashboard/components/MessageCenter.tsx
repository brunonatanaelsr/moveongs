'use client';

import React, { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useMessageThreads, usePostMessage, useThreadMessages } from '../hooks/useMessages';
import { useSession } from '../hooks/useSession';
import type { MessageThread, ThreadMessage } from '../types/messages';

function formatDateTime(value: string) {
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '—';
    }
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return '—';
  }
}

function formatRelative(value: string) {
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '—';
    }
    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.round(diffMs / 60000);
    if (diffMinutes < 1) {
      return 'agora';
    }
    if (diffMinutes < 60) {
      return `${diffMinutes} min atrás`;
    }
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours} h atrás`;
    }
    const diffDays = Math.round(diffHours / 24);
    return `${diffDays} dia${diffDays > 1 ? 's' : ''} atrás`;
  } catch {
    return '—';
  }
}

function ThreadListItem({
  thread,
  isActive,
  onSelect,
}: {
  thread: MessageThread;
  isActive: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(thread.id)}
      className={clsx(
        'group flex flex-col gap-2 rounded-2xl border px-4 py-3 text-left transition',
        isActive
          ? 'border-imm-emerald/60 bg-imm-emerald/10 text-white shadow-inner shadow-imm-emerald/30'
          : 'border-white/10 bg-white/0 text-white/80 hover:border-white/30 hover:bg-white/10 hover:text-white',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-white">
          {thread.subject || 'Sem assunto'}
        </span>
        <span className="text-xs uppercase tracking-wide text-white/50">
          {thread.scope}
        </span>
      </div>
      <p className="text-xs text-white/60">
        Criado por {thread.createdBy.name ?? 'Usuário sem nome'} em {formatDateTime(thread.createdAt)}
      </p>
      <div className="flex flex-wrap gap-2 text-[11px] text-white/50">
        {thread.members.map((member) => (
          <span key={member.id} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
            {member.name ?? 'Sem identificação'}
          </span>
        ))}
        {thread.members.length === 0 && <span className="text-white/40">Sem participantes adicionais</span>}
      </div>
    </button>
  );
}

function MessageBubble({ message }: { message: ThreadMessage }) {
  const confidentiality = message.isConfidential ? 'Confidencial' : 'Interno';
  return (
    <article className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/60">
        <span className="font-semibold text-white">{message.author.name ?? 'Usuário'}</span>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5">{confidentiality}</span>
          <span>{formatRelative(message.createdAt)}</span>
        </div>
      </header>
      <p className="text-sm leading-relaxed text-white/80 whitespace-pre-wrap">{message.body}</p>
    </article>
  );
}

export function MessageCenter() {
  const session = useSession();
  const { threads, isLoading: threadsLoading, error: threadsError, mutate: mutateThreads } = useMessageThreads();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [scopeFilter, setScopeFilter] = useState<'all' | string>('all');
  const [messageBody, setMessageBody] = useState('');
  const [isConfidential, setIsConfidential] = useState(false);

  const scopes = useMemo(() => {
    const unique = new Set<string>();
    threads.forEach((thread) => {
      if (thread.scope) {
        unique.add(thread.scope);
      }
    });
    return Array.from(unique).sort();
  }, [threads]);

  const filteredThreads = useMemo(() => {
    if (scopeFilter === 'all') {
      return threads;
    }
    return threads.filter((thread) => thread.scope === scopeFilter);
  }, [threads, scopeFilter]);

  useEffect(() => {
    if (filteredThreads.length === 0) {
      setSelectedThreadId(null);
      return;
    }
    if (!selectedThreadId || !filteredThreads.some((thread) => thread.id === selectedThreadId)) {
      setSelectedThreadId(filteredThreads[0].id);
    }
  }, [filteredThreads, selectedThreadId]);

  const {
    thread: selectedThread,
    messages,
    isLoading: threadLoading,
    error: threadError,
    mutate: mutateThreadMessages,
  } = useThreadMessages(selectedThreadId);
  const { sendMessage, status: postStatus, error: postError, isSending, resetStatus } = usePostMessage(selectedThreadId);

  useEffect(() => {
    setMessageBody('');
    setIsConfidential(false);
    resetStatus();
  }, [selectedThreadId, resetStatus]);

  useEffect(() => {
    if (postStatus === 'success') {
      const timeout = setTimeout(() => {
        resetStatus();
      }, 4000);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [postStatus, resetStatus]);

  const handleMessageBodyChange = (value: string) => {
    if (postStatus !== 'idle') {
      resetStatus();
    }
    setMessageBody(value);
  };

  const handleSendMessage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedThread || !selectedThreadId) {
      return;
    }

    if (!session) {
      return;
    }

    const trimmed = messageBody.trim();
    if (!trimmed) {
      return;
    }

    const confidential = isConfidential;
    const nowIso = new Date().toISOString();
    const optimisticMessage: ThreadMessage = {
      id: `optimistic-${Date.now()}`,
      threadId: selectedThreadId,
      author: {
        id: session?.user.id ?? 'current-user',
        name: session?.user.name ?? 'Você',
      },
      body: trimmed,
      visibility: selectedThread.visibility,
      isConfidential: confidential,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const previousThreadData = {
      thread: selectedThread,
      messages,
    } as { thread: MessageThread; messages: ThreadMessage[] };

    mutateThreadMessages(
      {
        thread: selectedThread,
        messages: [...messages, optimisticMessage],
      },
      false,
    );

    try {
      await sendMessage({ body: trimmed, isConfidential: confidential });
      setMessageBody('');
      setIsConfidential(false);
      mutateThreadMessages();
      mutateThreads();
    } catch (error) {
      mutateThreadMessages(previousThreadData, false);
      setMessageBody(trimmed);
      setIsConfidential(confidential);
    }
  };

  const disableSend = !messageBody.trim() || isSending || !selectedThread || !session;

  const participants = selectedThread?.members ?? [];
  const lastMessage = messages[messages.length - 1];
  const activitySummary = lastMessage
    ? `Última mensagem ${formatRelative(lastMessage.createdAt)}`
    : selectedThread
      ? `Criado em ${formatDateTime(selectedThread.createdAt)}`
      : null;

  return (
    <section className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-black/20 backdrop-blur-3xl">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold text-white">Centro de mensagens internas</h2>
          <p className="text-sm text-white/60">
            Conversas protegidas entre equipes e projetos, sincronizadas com as permissões do RBAC.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
          <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1">
            {threads.length} conversas
          </span>
          {activitySummary && (
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-white/60">{activitySummary}</span>
          )}
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/10 bg-white/5 p-4 text-xs uppercase tracking-wide text-white/60">
        <span>Filtrar por escopo</span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setScopeFilter('all')}
            className={clsx(
              'rounded-full border px-3 py-1 text-[11px] font-medium transition',
              scopeFilter === 'all'
                ? 'border-white/30 bg-white/10 text-white shadow-inner'
                : 'border-white/10 bg-white/0 text-white/70 hover:border-white/20 hover:bg-white/10 hover:text-white',
            )}
          >
            Todos
          </button>
          {scopes.map((scope) => (
            <button
              key={scope}
              type="button"
              onClick={() => setScopeFilter(scope)}
              className={clsx(
                'rounded-full border px-3 py-1 text-[11px] font-medium transition',
                scopeFilter === scope
                  ? 'border-white/30 bg-white/10 text-white shadow-inner'
                  : 'border-white/10 bg-white/0 text-white/70 hover:border-white/20 hover:bg-white/10 hover:text-white',
              )}
            >
              {scope}
            </button>
          ))}
        </div>
      </div>

      {threadsError && (
        <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-100">
          Não foi possível carregar as conversas. Tente novamente mais tarde.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          {threadsLoading && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">Carregando threads...</div>
          )}
          {!threadsLoading && filteredThreads.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
              Nenhuma conversa encontrada para o escopo selecionado.
            </div>
          )}
          {filteredThreads.map((thread) => (
            <ThreadListItem
              key={thread.id}
              thread={thread}
              isActive={thread.id === selectedThreadId}
              onSelect={setSelectedThreadId}
            />
          ))}
        </div>

        <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-4">
          {threadLoading && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">Carregando mensagens...</div>
          )}
          {threadError && (
            <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-100">
              Falha ao carregar mensagens desta conversa.
            </div>
          )}
          {!threadLoading && !threadError && !selectedThread && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
              Selecione uma conversa para visualizar as mensagens.
            </div>
          )}

          {selectedThread && !threadLoading && !threadError && (
            <>
              <header className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      {selectedThread.subject || 'Conversa sem assunto'}
                    </h3>
                    <p className="text-xs text-white/60">
                      Criada por {selectedThread.createdBy.name ?? 'Usuário'} em {formatDateTime(selectedThread.createdAt)}
                    </p>
                  </div>
                  <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-wide text-white/70">
                    Visibilidade: {selectedThread.visibility}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 text-xs text-white/70">
                  {participants.length > 0 ? (
                    participants.map((participant) => (
                      <span key={participant.id} className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                        {participant.name ?? 'Sem identificação'}
                      </span>
                    ))
                  ) : (
                    <span className="text-white/50">Nenhum outro participante listado</span>
                  )}
                </div>
              </header>

              <section className="flex flex-col gap-3">
                {messages.length === 0 && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
                    Ainda não há mensagens nesta conversa.
                  </div>
                )}
                {messages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
              </section>

              <form
                onSubmit={handleSendMessage}
                className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4"
              >
                <label
                  className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50"
                  htmlFor="message-center-input"
                >
                  Nova mensagem
                </label>
                <textarea
                  id="message-center-input"
                  value={messageBody}
                  onChange={(event) => handleMessageBodyChange(event.target.value)}
                  rows={4}
                  disabled={isSending}
                  className="w-full rounded-2xl border border-white/10 bg-transparent p-3 text-sm text-white placeholder:text-white/40 focus:border-cyan-300 focus:outline-none disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/40"
                  placeholder="Compartilhe atualizações, anexos ou alertas operacionais..."
                />
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/60">
                  <button
                    type="button"
                    onClick={() => {
                      if (postStatus !== 'idle') {
                        resetStatus();
                      }
                      setIsConfidential((prev) => !prev);
                    }}
                    className={clsx(
                      'rounded-full border px-3 py-1 transition',
                      isConfidential
                        ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-100'
                        : 'border-white/10 bg-transparent text-white/70 hover:border-white/20 hover:bg-white/10 hover:text-white',
                    )}
                  >
                    {isConfidential ? 'Confidencial ativado' : 'Marcar confidencial'}
                  </button>
                  <button
                    type="submit"
                    disabled={disableSend}
                    className={clsx(
                      'rounded-full border px-4 py-2 text-sm font-semibold transition',
                      disableSend
                        ? 'cursor-not-allowed border-white/20 bg-white/10 text-white/60'
                        : 'border-cyan-300/60 bg-cyan-500/20 text-white hover:bg-cyan-500/30',
                    )}
                  >
                    {isSending ? 'Enviando...' : 'Enviar mensagem'}
                  </button>
                </div>
                {postStatus === 'success' && (
                  <p className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                    Mensagem enviada com sucesso.
                  </p>
                )}
                {postStatus === 'error' && (
                  <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                    {postError?.message ?? 'Não foi possível enviar a mensagem. Tente novamente.'}
                  </p>
                )}
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
