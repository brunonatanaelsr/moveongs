'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Shell } from '../../components/Shell';
import { PrimarySidebar } from '../../components/PrimarySidebar';
import { useRequirePermission } from '../../hooks/useRequirePermission';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { LoadingState } from '../../components/LoadingState';

interface Message {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  attachments?: string[];
  confidential?: boolean;
}

interface Thread {
  id: string;
  title: string;
  scope: 'beneficiaria' | 'projeto' | 'institucional';
  participants: string[];
  unread: number;
  pinned?: boolean;
  lastMessage: string;
  messages: Message[];
}

const INITIAL_THREADS: Thread[] = [
  {
    id: 'thread-beneficiaria-01',
    title: 'Acompanhamento — Maria Aparecida',
    scope: 'beneficiaria',
    participants: ['Ana Costa', 'Clara Lima', 'Juliana Figueiredo'],
    unread: 2,
    pinned: true,
    lastMessage: 'Lembrete da consulta odontológica confirmado.',
    messages: [
      {
        id: 'msg-01',
        author: 'Ana Costa',
        body: 'Equipe, consulta odontológica reagendada para 12/05 às 9h. Documentos já validados no prontuário.',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
      },
      {
        id: 'msg-02',
        author: 'Clara Lima',
        body: 'Perfeito! Vou acompanhar com a família e confirmar transporte.',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
      },
      {
        id: 'msg-03',
        author: 'Juliana Figueiredo',
        body: 'Beneficiária confirmou participação na oficina de terça. Adicionei nota na timeline.',
        createdAt: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
      },
    ],
  },
  {
    id: 'thread-projeto-01',
    title: 'Projeto — Oficina de Costura',
    scope: 'projeto',
    participants: ['Coordenação', 'Equipe Pedagógica', 'Ana Costa'],
    unread: 0,
    lastMessage: 'Entrega de kits confirmada para a próxima turma.',
    messages: [
      {
        id: 'msg-11',
        author: 'Coordenação',
        body: 'Entrega de kits confirmada para quinta-feira. Necessitamos confirmação de presenças antecipada.',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
      },
      {
        id: 'msg-12',
        author: 'Equipe Pedagógica',
        body: 'Lista de presença enviada em anexo. Há duas substituições pendentes de matrícula.',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
        attachments: ['lista-presenca-maio.csv'],
      },
    ],
  },
  {
    id: 'thread-institucional',
    title: 'Avisos institucionais',
    scope: 'institucional',
    participants: ['Toda a equipe IMM'],
    unread: 0,
    pinned: true,
    lastMessage: 'Plantão jurídico disponível todas as quartas, 14h.',
    messages: [
      {
        id: 'msg-21',
        author: 'Coordenação Geral',
        body: 'Plantão jurídico com a Dra. Paula confirmado toda quarta-feira às 14h. Agendar pelo link interno.',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
      },
    ],
  },
];

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

export default function MessagesPage() {
  const session = useRequirePermission(['messages:read', 'messages:send']);
  const [threads, setThreads] = useState<Thread[]>(INITIAL_THREADS);
  const [selectedThreadId, setSelectedThreadId] = useState(threads[0]?.id ?? '');
  const [messageBody, setMessageBody] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  if (session === undefined) {
    return <LoadingState message="Verificando sessão..." />;
  }

  if (!session) {
    return <LoadingState message="Carregando..." />;
  }

  const search = searchTerm.trim().toLowerCase();
  const filteredThreads = search
    ? threads.filter((thread) => thread.title.toLowerCase().includes(search))
    : threads;

  const selectedThread = threads.find((thread) => thread.id === selectedThreadId) ?? threads[0];

  const handleSendMessage = () => {
    if (!selectedThread || !messageBody.trim()) return;
    const nowIso = new Date().toISOString();
    const message: Message = {
      id: `msg-${Math.random().toString(36).slice(2, 8)}`,
      author: session.user.name,
      body: messageBody.trim(),
      createdAt: nowIso,
    };

    setThreads((prev) =>
      prev.map((thread) =>
        thread.id === selectedThread.id
          ? {
              ...thread,
              messages: [...thread.messages, message],
              lastMessage: message.body,
              unread: 0,
            }
          : thread,
      ),
    );
    setMessageBody('');
  };

  const handleMarkAllRead = () => {
    setThreads((prev) => prev.map((thread) => ({ ...thread, unread: 0 })));
  };

  return (
    <Shell
      title="Centro de mensagens internas"
      description="Troque informações operacionais com a equipe, registre orientações por beneficiária e acompanhe avisos institucionais."
      sidebar={<PrimarySidebar session={session} />}
    >
      <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glass shadow-black/10">
          <div className="flex flex-col gap-2">
            <Input
              label="Buscar conversa"
              placeholder="Digite o título ou nome"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            <Button variant="secondary" size="sm" onClick={handleMarkAllRead}>
              Marcar todas como lidas
            </Button>
            <Button size="sm">
              Nova conversa
            </Button>
          </div>
          <ul className="space-y-2 text-sm text-white/80">
            {filteredThreads.map((thread) => {
              const isActive = thread.id === selectedThread?.id;
              return (
                <li key={thread.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedThreadId(thread.id)}
                    className={clsx(
                      'w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-white/30 hover:bg-white/10',
                      isActive && 'border-cyan-300/60 bg-cyan-500/10 text-white shadow-glass',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-white">{thread.title}</p>
                      {thread.unread > 0 && (
                        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-100">
                          {thread.unread}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/60">{thread.scope === 'beneficiaria' ? 'Beneficiária' : thread.scope === 'projeto' ? 'Projeto' : 'Institucional'}</p>
                    <p className="mt-2 text-xs text-white/60">{thread.lastMessage}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <div className="space-y-6">
          {selectedThread ? (
            <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glass shadow-black/10">
              <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">{selectedThread.title}</h2>
                  <p className="text-xs uppercase tracking-[0.2em] text-white/50">
                    Participantes: {selectedThread.participants.join(', ')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm">
                    Fixar conversa
                  </Button>
                  <Button variant="ghost" size="sm">
                    Exportar histórico
                  </Button>
                </div>
              </header>

              <div className="space-y-3">
                {selectedThread.messages.map((message) => (
                  <article
                    key={message.id}
                    className={clsx(
                      'rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80',
                      message.author === session.user.name && 'border-cyan-300/40 bg-cyan-500/10 text-white',
                    )}
                  >
                    <div className="flex items-center justify-between text-xs text-white/60">
                      <span className="font-semibold text-white">{message.author}</span>
                      <span>{formatDateTime(message.createdAt)}</span>
                    </div>
                    <p className="mt-2 text-sm text-white/80">{message.body}</p>
                    {message.attachments && (
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-cyan-100">
                        {message.attachments.map((attachment) => (
                          <span key={attachment} className="rounded-xl bg-cyan-500/20 px-2 py-0.5">
                            {attachment}
                          </span>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50" htmlFor="message-input">
                  Nova mensagem
                </label>
                <textarea
                  id="message-input"
                  value={messageBody}
                  onChange={(event) => setMessageBody(event.target.value)}
                  rows={4}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-transparent p-3 text-sm text-white placeholder:text-white/40 focus:border-cyan-300 focus:outline-none"
                  placeholder="Compartilhe atualizações, anexos ou alertas operacionais..."
                />
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex gap-2 text-xs text-white/60">
                    <button type="button" className="rounded-xl border border-white/10 px-3 py-1 hover:border-white/30">
                      Anexar arquivo
                    </button>
                    <button type="button" className="rounded-xl border border-white/10 px-3 py-1 hover:border-white/30">
                      Marcar confidencial
                    </button>
                  </div>
                  <Button onClick={handleSendMessage} disabled={!messageBody.trim()}>
                    Enviar mensagem
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-white/20 bg-white/5 p-6 text-sm text-white/60">
              Nenhuma conversa selecionada.
            </div>
          )}
        </div>
      </section>
    </Shell>
  );
}
