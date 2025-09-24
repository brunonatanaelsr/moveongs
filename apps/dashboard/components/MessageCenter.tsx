'use client';

import React, { useMemo, useState } from 'react';
import clsx from 'clsx';

interface Participant {
  id: string;
  name: string;
  role: string;
  avatar: string;
  status: 'online' | 'offline' | 'busy';
}

interface MessageAttachment {
  id: string;
  name: string;
  size: string;
  type: 'document' | 'image' | 'spreadsheet';
}

interface Message {
  id: string;
  senderId: string;
  content: string;
  timestamp: string;
  attachments?: MessageAttachment[];
  delivery?: 'enviado' | 'entregue' | 'lido';
}

interface MessageThread {
  id: string;
  subject: string;
  participants: Participant[];
  lastActivity: string;
  unreadCount: number;
  channel: 'Equipe Social' | 'Coordenação' | 'Diretoria';
  messages: Message[];
}

const THREADS: MessageThread[] = [
  {
    id: 't1',
    subject: 'Plano de ação Maria S.',
    participants: [
      { id: '1', name: 'Ana Costa', role: 'Assistente Social', avatar: 'AC', status: 'online' },
      { id: '2', name: 'João Pereira', role: 'Psicólogo', avatar: 'JP', status: 'busy' },
      { id: '3', name: 'Clara Lima', role: 'Coordenação', avatar: 'CL', status: 'offline' },
    ],
    lastActivity: 'há 2 min',
    unreadCount: 3,
    channel: 'Equipe Social',
    messages: [
      {
        id: 'm1',
        senderId: '1',
        content:
          'Equipe, segue atualização da visita domiciliar. Precisamos validar encaminhamento para reforço escolar e acompanhamento psicológico.',
        timestamp: '09:12',
      },
      {
        id: 'm2',
        senderId: '2',
        content:
          'Validei com a família e podemos iniciar as sessões na próxima terça. Documento de autorização anexado para assinatura digital.',
        attachments: [
          { id: 'a1', name: 'autorizacao_sessoes.pdf', size: '320 KB', type: 'document' },
        ],
        timestamp: '09:25',
        delivery: 'entregue',
      },
      {
        id: 'm3',
        senderId: '3',
        content:
          'Perfeito! Incluam também o reforço com a educadora Juliana. Atualizei o plano no painel e gerei tarefa para acompanhamento.',
        timestamp: '09:28',
        delivery: 'lido',
      },
    ],
  },
  {
    id: 't2',
    subject: 'Checklist evento comunitário',
    participants: [
      { id: '4', name: 'Fernanda Alves', role: 'Mobilização', avatar: 'FA', status: 'online' },
      { id: '5', name: 'Rafael Nogueira', role: 'Comunicação', avatar: 'RN', status: 'online' },
      { id: '6', name: 'Equipe Parceiros', role: 'Parceiros', avatar: 'EP', status: 'offline' },
    ],
    lastActivity: 'há 35 min',
    unreadCount: 0,
    channel: 'Coordenação',
    messages: [
      {
        id: 'm4',
        senderId: '4',
        content: 'Checklist atualizado com logística e alimentação. Confiram se algo falta.',
        timestamp: '08:40',
      },
      {
        id: 'm5',
        senderId: '5',
        content: 'Adicionei banner oficial e programação em PDF.',
        attachments: [
          { id: 'a2', name: 'programacao_evento.pdf', size: '1.2 MB', type: 'document' },
          { id: 'a3', name: 'arte_banner.png', size: '840 KB', type: 'image' },
        ],
        timestamp: '08:52',
        delivery: 'enviado',
      },
    ],
  },
  {
    id: 't3',
    subject: 'Indicadores semanais - resumo',
    participants: [
      { id: '7', name: 'Diretoria IM', role: 'Diretoria', avatar: 'DI', status: 'offline' },
      { id: '3', name: 'Clara Lima', role: 'Coordenação', avatar: 'CL', status: 'offline' },
    ],
    lastActivity: 'ontem',
    unreadCount: 1,
    channel: 'Diretoria',
    messages: [
      {
        id: 'm6',
        senderId: '3',
        content: 'Resumo enviado para aprovação. Destaque para aumento de presença no projeto Movimento.',
        timestamp: '18:16',
      },
      {
        id: 'm7',
        senderId: '7',
        content: 'Ótimo trabalho! Vou apresentar na reunião com conselhos.',
        timestamp: '18:34',
        delivery: 'lido',
      },
    ],
  },
];

function PresenceIndicator({ status }: { status: Participant['status'] }) {
  const colors: Record<Participant['status'], string> = {
    online: 'bg-emerald-400 shadow-[0_0_12px] shadow-emerald-400/60',
    busy: 'bg-amber-400 shadow-[0_0_12px] shadow-amber-400/60',
    offline: 'bg-slate-500',
  };

  return <span className={clsx('inline-flex h-2.5 w-2.5 rounded-full', colors[status])} />;
}

export function MessageCenter() {
  const [selectedThreadId, setSelectedThreadId] = useState(THREADS[0].id);

  const selectedThread = useMemo(
    () => THREADS.find((thread) => thread.id === selectedThreadId) ?? THREADS[0],
    [selectedThreadId],
  );

  return (
    <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <article className="flex h-full flex-col rounded-3xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-black/20 backdrop-blur-3xl">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Mensagens internas</h2>
            <p className="text-xs text-white/60">Threads com anexos, indicadores em tempo real e organização por canal.</p>
          </div>
          <span className="rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-medium text-emerald-300">Sincronizado</span>
        </header>

        <div className="flex flex-col gap-2 overflow-y-auto pr-1">
          {THREADS.map((thread) => (
            <button
              key={thread.id}
              type="button"
              onClick={() => setSelectedThreadId(thread.id)}
              className={clsx(
                'flex flex-col gap-2 rounded-2xl border border-transparent bg-white/0 p-3 text-left transition hover:border-white/20 hover:bg-white/10',
                selectedThreadId === thread.id && 'border-white/30 bg-white/10 shadow-inner',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-white/60">{thread.channel}</span>
                <span className="text-xs text-white/50">{thread.lastActivity}</span>
              </div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white">{thread.subject}</h3>
                {thread.unreadCount > 0 && (
                  <span className="rounded-full bg-rose-500/80 px-2 text-[10px] font-medium uppercase tracking-wide text-white">
                    {thread.unreadCount} novas
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {thread.participants.slice(0, 3).map((participant) => (
                  <div key={participant.id} className="flex items-center gap-2 text-xs text-white/70">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-white">
                      {participant.avatar}
                    </span>
                    <PresenceIndicator status={participant.status} />
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>
      </article>

      <article className="flex h-full flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-black/20 backdrop-blur-3xl">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="text-xs uppercase tracking-wide text-white/60">Thread ativa</span>
            <h2 className="text-xl font-semibold text-white">{selectedThread.subject}</h2>
          </div>
          <div className="flex items-center gap-3 text-xs text-white/70">
            <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              Atualizações em tempo real
            </span>
            <span className="rounded-full bg-imm-indigo/10 px-3 py-1 text-imm-indigo-200">
              {selectedThread.participants.length} participantes
            </span>
          </div>
        </header>

        <div className="flex flex-col gap-6 overflow-y-auto">
          {selectedThread.messages.map((message) => {
            const sender = selectedThread.participants.find((participant) => participant.id === message.senderId);
            return (
              <div
                key={message.id}
                className="flex flex-col gap-2 rounded-2xl border border-white/5 bg-white/5 p-4 shadow-inner shadow-black/10"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white">
                      {sender?.avatar}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white">{sender?.name}</p>
                      <p className="text-[11px] uppercase tracking-wide text-white/50">{sender?.role}</p>
                    </div>
                  </div>
                  <span className="text-xs text-white/60">{message.timestamp}</span>
                  {message.delivery && (
                    <span className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[10px] uppercase tracking-wide text-white/70">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      {message.delivery}
                    </span>
                  )}
                </div>

                <p className="text-sm text-white/80">{message.content}</p>

                {message.attachments && message.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {message.attachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80"
                      >
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-imm-indigo/20 text-imm-indigo-100">
                          {attachment.type === 'document' && '📄'}
                          {attachment.type === 'image' && '🖼️'}
                          {attachment.type === 'spreadsheet' && '📊'}
                        </span>
                        <div className="flex flex-col">
                          <span className="font-medium text-white">{attachment.name}</span>
                          <span className="text-[11px] uppercase tracking-wide text-white/50">{attachment.size}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <footer className="rounded-2xl border border-white/10 bg-white/0 p-4">
          <span className="mb-2 block text-xs uppercase tracking-wide text-white/50">Enviar atualização</span>
          <div className="flex flex-col gap-3 sm:flex-row">
            <textarea
              rows={3}
              placeholder="Escreva uma mensagem para a equipe..."
              className="min-h-[90px] flex-1 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
            />
            <div className="flex flex-col justify-between gap-2">
              <button
                type="button"
                className="flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/0 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40 hover:bg-white/10"
              >
                <span>📎</span>
                Anexar
              </button>
              <button
                type="button"
                className="flex items-center justify-center gap-2 rounded-2xl bg-imm-emerald/80 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-imm-emerald/30 transition hover:bg-imm-emerald"
              >
                Enviar atualização
              </button>
            </div>
          </div>
        </footer>
      </article>
    </section>
  );
}
