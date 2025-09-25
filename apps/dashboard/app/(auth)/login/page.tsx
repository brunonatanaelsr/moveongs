'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { login, mapLoginResponseToSession, type LoginMfaResponse, type LoginSuccessResponse } from '../../../lib/auth';
import { saveSession } from '../../../lib/session';
import { Card } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { Alert } from '../../../components/ui/alert';

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
        <Card className="w-full max-w-md space-y-8" padding="lg">
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-white">Acessar painel IMM</h1>
            <p className="text-sm text-slate-200/70">Use suas credenciais institucionais para visualizar o dashboard.</p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <Input
                id="email"
                type="email"
                label="E-mail institucional"
                placeholder="nome@movemarias.org"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                disabled={isSubmitting}
              />

              <Input
                id="password"
                type="password"
                label="Senha"
                placeholder="Digite sua senha"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                disabled={isSubmitting}
              />
            </div>

            {error && <Alert variant="error">{error}</Alert>}

            {pendingChallenge && (
              <Alert variant="warning" title="Verificação adicional necessária">
                Um desafio de múltiplos fatores foi iniciado. Conclua a verificação via {pendingChallenge.methods.join(' ou ')}
                para continuar.
              </Alert>
            )}

            <Button type="submit" fullWidth disabled={isSubmitting}>
              {isSubmitting ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>

          <p className="text-center text-xs text-slate-400">
            Dificuldades para entrar? Procure a coordenação IMM para redefinir sua senha ou habilitar MFA.
          </p>
        </Card>
      </div>
    </div>
  );
}
