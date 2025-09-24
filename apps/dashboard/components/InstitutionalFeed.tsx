'use client';

import React, { useMemo, useState } from 'react';
import clsx from 'clsx';

interface FeedAttachment {
  id: string;
  name: string;
  type: 'pdf' | 'image' | 'video';
}

interface FeedPost {
  id: string;
  title: string;
  summary: string;
  audiences: string[];
  postedAt: string;
  author: string;
  requiresAck: boolean;
  attachments?: FeedAttachment[];
  stats: {
    confirmed: number;
    pending: number;
  };
  notifyChannels: ('app' | 'email' | 'whatsapp')[];
}

const POSTS: FeedPost[] = [
  {
    id: 'p1',
    title: 'Campanha de vacinação em parceria com UBS Jardim Azul',
    summary:
      'Encaminhar beneficiárias do grupo de risco para vacinação até sexta-feira. A ação terá transporte organizado e acompanhamento da equipe de saúde.',
    audiences: ['Equipe Social', 'Educadoras', 'Voluntárias'],
    postedAt: 'Hoje, 08:00',
    author: 'Coordenação Geral',
    requiresAck: true,
    attachments: [
      { id: 'att1', name: 'briefing_campanha.pdf', type: 'pdf' },
      { id: 'att2', name: 'peças_redes.zip', type: 'image' },
    ],
    stats: {
      confirmed: 32,
      pending: 8,
    },
    notifyChannels: ['app', 'email'],
  },
  {
    id: 'p2',
    title: 'Agenda cultural da semana',
    summary:
      'Confira as oficinas e visitas programadas entre 12 e 16 de agosto. Destaque para a oficina de fotografia com o Instituto Luz.',
    audiences: ['Comunicação', 'Equipe Social'],
    postedAt: 'Ontem, 18:45',
    author: 'Núcleo de Cultura',
    requiresAck: false,
    attachments: [{ id: 'att3', name: 'agenda_semana.pdf', type: 'pdf' }],
    stats: {
      confirmed: 21,
      pending: 0,
    },
    notifyChannels: ['app'],
  },
  {
    id: 'p3',
    title: 'Atualização de protocolo - consentimento digital',
    summary:
      'Novo fluxo para coleta de consentimento digital, incluindo verificação de responsáveis e assinatura eletrônica com armazenamento em nuvem segura.',
    audiences: ['Equipe Administrativa', 'Equipe Social', 'Diretoria'],
    postedAt: '10 ago, 11:20',
    author: 'Equipe Jurídica',
    requiresAck: true,
    stats: {
      confirmed: 12,
      pending: 14,
    },
    notifyChannels: ['app', 'email', 'whatsapp'],
  },
];

const NOTIFY_LABELS: Record<FeedPost['notifyChannels'][number], string> = {
  app: 'Notificação no app',
  email: 'E-mail automático',
  whatsapp: 'Mensagem WhatsApp',
};

export function InstitutionalFeed() {
  const [confirmedPosts, setConfirmedPosts] = useState<Record<string, boolean>>({});

  const totals = useMemo(() => {
    return POSTS.reduce(
      (acc, post) => {
        const confirmed = confirmedPosts[post.id] ? post.stats.pending + post.stats.confirmed : post.stats.confirmed;
        const pending = confirmedPosts[post.id] ? 0 : post.stats.pending;
        return {
          confirmed: acc.confirmed + confirmed,
          pending: acc.pending + pending,
        };
      },
      { confirmed: 0, pending: 0 },
    );
  }, [confirmedPosts]);

  return (
    <article className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-black/20 backdrop-blur-3xl">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Feed institucional segmentado</h2>
          <p className="text-sm text-white/60">
            Conteúdos direcionados por público, com confirmação de leitura e trilhas de comunicação automatizadas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-white/70">
          <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1">
            {totals.confirmed} confirmações
          </span>
          <span className="rounded-full border border-rose-400/40 bg-rose-500/10 px-3 py-1 text-rose-200">
            {totals.pending} pendentes
          </span>
        </div>
      </header>

      <div className="grid gap-4">
        {POSTS.map((post) => {
          const isConfirmed = confirmedPosts[post.id] ?? false;
          return (
            <article
              key={post.id}
              className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent p-6 shadow-inner shadow-black/10"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-col gap-2">
                  <span className="text-xs uppercase tracking-wide text-white/60">{post.postedAt}</span>
                  <h3 className="text-lg font-semibold text-white">{post.title}</h3>
                  <p className="max-w-2xl text-sm text-white/70">{post.summary}</p>
                </div>
                <div className="flex flex-col items-end gap-2 text-right text-xs text-white/60">
                  <span>{post.author}</span>
                  <div className="flex flex-wrap justify-end gap-2">
                    {post.audiences.map((audience) => (
                      <span
                        key={audience}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-white/80"
                      >
                        {audience}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {post.attachments && post.attachments.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {post.attachments.map((attachment) => (
                    <span
                      key={attachment.id}
                      className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80"
                    >
                      <span className="text-lg">
                        {attachment.type === 'pdf' && '📄'}
                        {attachment.type === 'image' && '🖼️'}
                        {attachment.type === 'video' && '🎬'}
                      </span>
                      {attachment.name}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-4 flex flex-col gap-4 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3 text-xs text-white/70">
                  {post.notifyChannels.map((channel) => (
                    <span
                      key={channel}
                      className="flex items-center gap-2 rounded-full border border-white/10 bg-white/0 px-3 py-1"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      {NOTIFY_LABELS[channel]}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-3 text-xs text-white/80">
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                    {isConfirmed ? post.stats.pending + post.stats.confirmed : post.stats.confirmed} confirmaram
                  </span>
                  <span className="rounded-full border border-rose-400/40 bg-rose-500/10 px-3 py-1 text-rose-200">
                    {isConfirmed ? 0 : post.stats.pending} pendentes
                  </span>
                  {post.requiresAck && (
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmedPosts((prev) => ({
                          ...prev,
                          [post.id]: !prev[post.id],
                        }))
                      }
                      className={clsx(
                        'rounded-2xl px-4 py-2 text-sm font-semibold transition',
                        isConfirmed
                          ? 'border border-white/10 bg-white/10 text-white hover:border-white/30'
                          : 'bg-imm-emerald/80 text-white shadow-lg shadow-imm-emerald/30 hover:bg-imm-emerald',
                      )}
                    >
                      {isConfirmed ? 'Leitura confirmada' : 'Confirmar leitura'}
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </article>
  );
}
