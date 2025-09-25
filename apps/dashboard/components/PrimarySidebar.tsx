'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';
import { clearSession, type Session } from '../lib/session';

const NAVIGATION_ITEMS: { label: string; href: string; description: string }[] = [
  {
    label: 'Visão geral',
    href: '/',
    description: 'Indicadores consolidados das beneficiárias e projetos.',
  },
  {
    label: 'Projetos',
    href: '/projects',
    description: 'Gerencie turmas, capacidades e responsáveis.',
  },
  {
    label: 'Beneficiárias',
    href: '/beneficiaries',
    description: 'Acompanhe cadastros, presenças e planos de ação.',
  },
  {
    label: 'Mensagens',
    href: '/messages',
    description: 'Central unificada de comunicados institucionais.',
  },
];

const TEAM_AVAILABILITY: { name: string; role: string; status: 'online' | 'ausente' | 'ocupado' }[] = [
  { name: 'Ana Costa', role: 'Assistente social', status: 'online' },
  { name: 'João Pereira', role: 'Psicólogo', status: 'ocupado' },
  { name: 'Clara Lima', role: 'Coordenação', status: 'online' },
  { name: 'Equipe Pedagógica', role: 'Educadoras', status: 'ausente' },
];

const STATUS_COLORS: Record<'online' | 'ausente' | 'ocupado', string> = {
  online: 'bg-emerald-400 shadow-[0_0_12px] shadow-emerald-400/60',
  ausente: 'bg-slate-400',
  ocupado: 'bg-amber-400 shadow-[0_0_12px] shadow-amber-400/50',
};

function AvailabilityDot({ status }: { status: 'online' | 'ausente' | 'ocupado' }) {
  return <span className={clsx('inline-flex h-2.5 w-2.5 rounded-full', STATUS_COLORS[status])} />;
}

interface PrimarySidebarProps {
  session: Session;
}

export function PrimarySidebar({ session }: PrimarySidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  function handleSignOut() {
    clearSession();
    router.replace('/login');
  }

  return (
    <div className="space-y-10">
      <header className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.28em] text-white/50">Instituto Move Marias</p>
          <h2 className="text-2xl font-semibold text-white">Painel de operações</h2>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-glass shadow-black/20">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400/20 text-lg font-semibold text-emerald-200">
              {session.user.name
                .split(' ')
                .map((chunk) => chunk[0])
                .slice(0, 2)
                .join('')}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">{session.user.name}</p>
              <p className="text-xs text-white/60">{session.user.email}</p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-2xl border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:border-white/40 hover:bg-white/20"
            >
              Sair
            </button>
          </div>
          {session.roles.length > 0 && (
            <p className="mt-4 text-xs uppercase tracking-wider text-white/50">
              {session.roles.join(' • ')}
            </p>
          )}
        </div>
      </header>

      <nav className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/40">Navegação</p>
        <ul className="space-y-2">
          {NAVIGATION_ITEMS.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={clsx(
                    'block rounded-3xl border border-transparent bg-white/0 p-4 transition',
                    'hover:border-white/20 hover:bg-white/10 hover:shadow-glass',
                    isActive && 'border-white/30 bg-white/15 shadow-glass backdrop-blur-3xl',
                  )}
                >
                  <p className="text-sm font-semibold text-white">{item.label}</p>
                  <p className="mt-1 text-xs text-white/70">{item.description}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {session.projectScopes.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/40">Projetos atribuídos</p>
          <ul className="space-y-2">
            {session.projectScopes.map((project) => (
              <li key={project} className="rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/80">
                {project}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/40">Equipe conectada</p>
        <ul className="space-y-3">
          {TEAM_AVAILABILITY.map((member) => (
            <li key={member.name} className="flex items-center justify-between rounded-3xl border border-white/10 bg-white/5 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-white">{member.name}</p>
                <p className="text-xs text-white/60">{member.role}</p>
              </div>
              <div className="flex items-center gap-2">
                <AvailabilityDot status={member.status} />
                <span className="text-xs capitalize text-white/70">{member.status}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
