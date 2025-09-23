'use client';

import { ReactNode } from 'react';
import clsx from 'clsx';

interface KpiCardProps {
  label: string;
  value: ReactNode;
  trend?: ReactNode;
  accent?: 'cyan' | 'indigo' | 'emerald' | 'rose';
}

const accentMap: Record<NonNullable<KpiCardProps['accent']>, string> = {
  cyan: 'from-imm-cyan/20 via-white/5 to-transparent border-imm-cyan/40',
  indigo: 'from-imm-indigo/20 via-white/5 to-transparent border-imm-indigo/40',
  emerald: 'from-imm-emerald/20 via-white/5 to-transparent border-imm-emerald/40',
  rose: 'from-rose-500/20 via-white/5 to-transparent border-rose-400/40',
};

export function KpiCard({ label, value, trend, accent = 'cyan' }: KpiCardProps) {
  return (
    <article
      className={clsx(
        'relative overflow-hidden rounded-3xl border bg-white/5 p-6 shadow-lg shadow-black/20 backdrop-blur-3xl transition hover:border-white/30',
        accentMap[accent],
      )}
    >
      <div className="flex flex-col gap-3">
        <span className="text-xs uppercase tracking-wide text-white/60">{label}</span>
        <div className="text-3xl font-semibold text-white">{value}</div>
        {trend && <div className="text-xs text-white/70">{trend}</div>}
      </div>
    </article>
  );
}
