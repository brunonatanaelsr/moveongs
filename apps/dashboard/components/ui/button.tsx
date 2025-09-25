'use client';

import { forwardRef } from 'react';
import clsx from 'clsx';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-imm-emerald/90 text-imm-emerald-950 shadow-lg shadow-imm-emerald/30 hover:bg-imm-emerald/80 focus:ring-imm-emerald/40 disabled:bg-imm-emerald/60',
  secondary:
    'border border-white/15 bg-white/10 text-white shadow-md shadow-black/20 hover:border-white/25 hover:bg-white/20 focus:ring-white/40 disabled:opacity-60',
  ghost: 'text-white hover:bg-white/10 focus:ring-white/30 disabled:text-white/60',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-3 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', fullWidth, className, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    />
  ),
);

Button.displayName = 'Button';
