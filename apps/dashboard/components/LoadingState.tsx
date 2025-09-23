'use client';

export function LoadingState({ message = 'Carregando dados...' }: { message?: string }) {
  return (
    <div className="flex h-64 items-center justify-center rounded-3xl border border-white/10 bg-white/5 shadow-lg shadow-black/20">
      <div className="flex flex-col items-center gap-3 text-white/80">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-imm-cyan" />
        <span className="text-sm">{message}</span>
      </div>
    </div>
  );
}
