'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { login, mapLoginResponseToSession, type LoginMfaResponse, type LoginSuccessResponse } from '../../../lib/auth';
import { saveSession } from '../../../lib/session';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendingChallenge, setPendingChallenge] = useState<LoginMfaResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setPendingChallenge(null);

    if (!email || !password) {
      setError('Informe e-mail e senha para continuar.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login(email, password);
      if ('mfaRequired' in result && result.mfaRequired) {
        setPendingChallenge(result);
        return;
      }

      const session = mapLoginResponseToSession(result as LoginSuccessResponse);
      saveSession(session);
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado ao entrar.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 left-1/3 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute top-1/3 -right-32 h-80 w-80 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 h-64 w-64 rounded-full bg-cyan-400/15 blur-3xl" />
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-md space-y-8 rounded-3xl border border-white/10 bg-white/5 p-10 backdrop-blur-3xl shadow-2xl shadow-black/30">
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-white">Acessar painel IMM</h1>
            <p className="text-sm text-slate-200/70">Use suas credenciais institucionais para visualizar o dashboard.</p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <label className="block text-left text-sm font-medium text-slate-200" htmlFor="email">
                E-mail institucional
              </label>
              <input
                id="email"
                type="email"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white placeholder:text-slate-400 focus:border-emerald-400/70 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                placeholder="nome@movemarias.org"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                disabled={isSubmitting}
              />

              <label className="block text-left text-sm font-medium text-slate-200" htmlFor="password">
                Senha
              </label>
              <input
                id="password"
                type="password"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white placeholder:text-slate-400 focus:border-emerald-400/70 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                placeholder="Digite sua senha"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                disabled={isSubmitting}
              />
            </div>

            {error && (
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </div>
            )}

            {pendingChallenge && (
              <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                <p className="font-medium">Verificação adicional necessária</p>
                <p className="mt-1 text-amber-100/80">
                  Um desafio de múltiplos fatores foi iniciado. Conclua a verificação via {pendingChallenge.methods.join(' ou ')}
                  para continuar.
                </p>
              </div>
            )}

            <button
              type="submit"
              className="w-full rounded-2xl bg-emerald-500/90 px-4 py-3 text-base font-semibold text-emerald-950 shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <p className="text-center text-xs text-slate-400">
            Dificuldades para entrar? Procure a coordenação IMM para redefinir sua senha ou habilitar MFA.
          </p>
        </div>
      </div>
    </div>
  );
}
