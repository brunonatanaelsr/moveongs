'use client';

import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { useFeedPosts } from '../hooks/useFeed';
import type { FeedPost } from '../types/feed';

function formatPublishedAt(post: FeedPost) {
  if (!post.publishedAt) {
    return 'Não publicado';
  }
  try {
    const date = new Date(post.publishedAt);
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

function visibilityLabel(visibility: FeedPost['visibility']) {
  switch (visibility) {
    case 'public':
      return 'Público';
    case 'project':
      return 'Projeto';
    case 'hidden':
      return 'Oculto';
    default:
      return 'Interno';
  }
}

function PostCard({ post }: { post: FeedPost }) {
  const preview = post.body && post.body.length > 280 ? `${post.body.slice(0, 277)}…` : post.body ?? 'Sem conteúdo';
  const projectLabel = post.project?.name ?? 'Institucional';

  return (
    <article className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent p-6 shadow-inner shadow-black/10">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 uppercase tracking-wide">
              {projectLabel}
            </span>
            <span className="rounded-full border border-white/10 bg-white/0 px-3 py-1 uppercase tracking-wide text-white/70">
              {visibilityLabel(post.visibility)}
            </span>
            <span className="text-white/50">{formatPublishedAt(post)}</span>
          </div>
          <h3 className="text-lg font-semibold text-white">{post.title ?? preview.slice(0, 60)}</h3>
        </div>
        <div className="flex flex-col items-end gap-2 text-right text-xs text-white/60">
          <span className="text-3xl font-semibold text-white">{post.commentCount}</span>
          <span className="uppercase tracking-wide">comentários</span>
        </div>
      </header>

      <p className="text-sm leading-relaxed text-white/70 whitespace-pre-wrap">{preview}</p>

      <footer className="flex flex-wrap items-center gap-2 text-xs text-white/60">
        <span>Por {post.author.name ?? 'Usuário'}</span>
        {post.tags.map((tag) => (
          <span key={tag} className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
            #{tag}
          </span>
        ))}
        {post.tags.length === 0 && <span className="rounded-full border border-white/10 bg-white/0 px-3 py-1">Sem tags</span>}
      </footer>
    </article>
  );
}

export function InstitutionalFeed() {
  const { posts, isLoading, error } = useFeedPosts({ limit: 12 });
  const [projectFilter, setProjectFilter] = useState<'all' | string>('all');

  const projectOptions = useMemo(() => {
    const unique = new Set<string>();
    posts.forEach((post) => {
      if (post.project?.id) {
        unique.add(`${post.project.id}::${post.project.name ?? 'Projeto sem nome'}`);
      }
    });
    return Array.from(unique)
      .map((value) => {
        const [id, name] = value.split('::');
        return { id, name };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [posts]);

  const filteredPosts = useMemo(() => {
    if (projectFilter === 'all') {
      return posts;
    }
    return posts.filter((post) => post.project?.id === projectFilter);
  }, [posts, projectFilter]);

  const totals = useMemo(() => {
    return filteredPosts.reduce(
      (acc, post) => {
        return {
          posts: acc.posts + 1,
          comments: acc.comments + post.commentCount,
        };
      },
      { posts: 0, comments: 0 },
    );
  }, [filteredPosts]);

  return (
    <section className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-black/20 backdrop-blur-3xl">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Feed institucional</h2>
            <p className="text-sm text-white/60">
              Publicações moderadas em tempo real, conectadas a projetos e notificações automáticas do Instituto Move Marias.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-white/70">
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1">{totals.posts} posts</span>
            <span className="rounded-full border border-imm-indigo/40 bg-imm-indigo/20 px-3 py-1 text-imm-indigo-50">
              {totals.comments} comentários
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-wide text-white/60">
            <span>Filtrar por projeto</span>
            {projectFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setProjectFilter('all')}
                className="rounded-full border border-white/20 bg-white/0 px-3 py-1 text-[11px] font-medium text-white/70 transition hover:border-white/40 hover:bg-white/10 hover:text-white"
              >
                Limpar filtros
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setProjectFilter('all')}
              className={clsx(
                'rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide transition',
                projectFilter === 'all'
                  ? 'border-white/30 bg-white/10 text-white shadow-inner'
                  : 'border-white/10 bg-white/0 text-white/70 hover:border-white/20 hover:bg-white/10 hover:text-white',
              )}
            >
              Todos
            </button>
            {projectOptions.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => setProjectFilter(project.id)}
                className={clsx(
                  'rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide transition',
                  projectFilter === project.id
                    ? 'border-white/30 bg-white/10 text-white shadow-inner'
                    : 'border-white/10 bg-white/0 text-white/70 hover:border-white/20 hover:bg-white/10 hover:text-white',
                )}
              >
                {project.name}
              </button>
            ))}
            {projectOptions.length === 0 && (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
                Nenhum projeto segmentado
              </span>
            )}
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-100">
          Não foi possível carregar o feed agora.
        </div>
      )}

      {isLoading && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
          Carregando publicações...
        </div>
      )}

      {!isLoading && filteredPosts.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
          Nenhum post encontrado para o filtro atual.
        </div>
      )}

      <div className="grid gap-4">
        {filteredPosts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </section>
  );
}
