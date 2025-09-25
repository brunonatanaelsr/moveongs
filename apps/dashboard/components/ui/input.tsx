'use client';

import { forwardRef } from 'react';
import clsx from 'clsx';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, className, id, disabled, ...props }, ref) => {
    const inputId = id ?? props.name;
    return (
      <label className="flex flex-col gap-2 text-left text-sm font-medium text-slate-200" htmlFor={inputId}>
        {label}
        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          className={clsx(
            'w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white placeholder:text-slate-400 focus:border-imm-emerald/60 focus:outline-none focus:ring-2 focus:ring-imm-emerald/40 disabled:opacity-60',
            className,
          )}
          {...props}
        />
        {hint && <span className="text-xs font-normal text-slate-400">{hint}</span>}
      </label>
    );
  },
);

Input.displayName = 'Input';
