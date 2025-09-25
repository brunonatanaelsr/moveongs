'use client';

import clsx from 'clsx';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: 'sm' | 'md' | 'lg';
}

const paddingStyles = {
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export function Card({ className, padding = 'md', ...props }: CardProps) {
  return (
    <div
      className={clsx(
        'rounded-3xl border border-white/10 bg-white/5 shadow-lg shadow-black/20 backdrop-blur-3xl',
        paddingStyles[padding],
        className,
      )}
      {...props}
    />
  );
}
