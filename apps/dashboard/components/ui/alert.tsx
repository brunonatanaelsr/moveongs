'use client';

import clsx from 'clsx';

export type AlertVariant = 'info' | 'error' | 'warning' | 'success';

interface AlertProps {
  children: React.ReactNode;
  variant?: AlertVariant;
  title?: string;
}

const variantStyles: Record<AlertVariant, string> = {
  info: 'border-sky-400/30 bg-sky-500/10 text-sky-100',
  error: 'border-rose-500/40 bg-rose-500/10 text-rose-100',
  warning: 'border-amber-400/40 bg-amber-500/10 text-amber-100',
  success: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100',
};

export function Alert({ children, variant = 'info', title }: AlertProps) {
  return (
    <div className={clsx('rounded-2xl border px-4 py-3 text-sm', variantStyles[variant])}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={clsx(title && 'mt-1 text-sm font-normal')}>{children}</div>
    </div>
  );
}
