'use client';

import type { PropsWithChildren, ReactNode } from 'react';
import clsx from 'clsx';

interface ShellProps {
  title?: string;
  description?: string;
  sidebar?: ReactNode;
  headerExtra?: ReactNode;
}

export function Shell({ title, description, sidebar, headerExtra, children }: PropsWithChildren<ShellProps>) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-16 -left-16 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-96 w-96 rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col lg:flex-row">
        {sidebar && (
          <aside className="lg:w-80 flex-shrink-0 border-b border-white/10 bg-white/5 backdrop-blur-3xl lg:border-b-0 lg:border-r">
            <div className="sticky top-0 px-6 py-8 space-y-6">
              {sidebar}
            </div>
          </aside>
        )}

        <main className={clsx('flex-1 px-6 py-10', !sidebar && 'lg:px-16')}>
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
            {(title || description || headerExtra) && (
              <header className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-lg shadow-black/20 backdrop-blur-3xl">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    {title && <h1 className="text-3xl font-semibold tracking-tight text-white">{title}</h1>}
                    {description && (
                      <p className="mt-2 max-w-2xl text-sm text-slate-200/80">{description}</p>
                    )}
                  </div>
                  {headerExtra}
                </div>
              </header>
            )}

            <section className="flex flex-col gap-4 pb-16">{children}</section>
          </div>
        </main>
      </div>
    </div>
  );
}
