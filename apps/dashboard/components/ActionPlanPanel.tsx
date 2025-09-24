'use client';

import React, { useMemo, useState } from 'react';
import clsx from 'clsx';

interface ActionTask {
  id: string;
  title: string;
  owner: string;
  dueDate: string;
  status: 'pendente' | 'em_andamento' | 'concluida';
  priority: 'alta' | 'media' | 'baixa';
  reminder: string;
  relatedNotifications: string[];
}

const TASKS: ActionTask[] = [
  {
    id: 'ta1',
    title: 'Reunião de alinhamento com família',
    owner: 'Ana Costa',
    dueDate: 'Hoje, 16:00',
    status: 'em_andamento',
    priority: 'alta',
    reminder: 'Notificação enviada às 14:00',
    relatedNotifications: ['App beneficiária', 'WhatsApp responsável'],
  },
  {
    id: 'ta2',
    title: 'Cadastro de reforço escolar',
    owner: 'Juliana Nunes',
    dueDate: '13 ago',
    status: 'pendente',
    priority: 'media',
    reminder: 'Lembrete programado para amanhã às 09:00',
    relatedNotifications: ['E-mail coordenação'],
  },
  {
    id: 'ta3',
    title: 'Atualizar plano socioemocional',
    owner: 'João Pereira',
    dueDate: '14 ago',
    status: 'concluida',
    priority: 'baixa',
    reminder: 'Registro automático no diário de bordo',
    relatedNotifications: ['App equipe', 'Painel dashboards'],
  },
];

function PriorityBadge({ priority }: { priority: ActionTask['priority'] }) {
  const labelMap: Record<ActionTask['priority'], string> = {
    alta: 'Prioridade alta',
    media: 'Prioridade média',
    baixa: 'Prioridade baixa',
  };

  const colorMap: Record<ActionTask['priority'], string> = {
    alta: 'border-rose-400/50 bg-rose-500/10 text-rose-100',
    media: 'border-amber-400/40 bg-amber-500/10 text-amber-100',
    baixa: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100',
  };

  return (
    <span className={clsx('rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-wide', colorMap[priority])}>
      {labelMap[priority]}
    </span>
  );
}

function StatusBadge({ status }: { status: ActionTask['status'] }) {
  const labelMap: Record<ActionTask['status'], string> = {
    pendente: 'Pendente',
    em_andamento: 'Em andamento',
    concluida: 'Concluída',
  };

  const colorMap: Record<ActionTask['status'], string> = {
    pendente: 'bg-white/10 text-white',
    em_andamento: 'bg-imm-indigo/30 text-imm-indigo-100',
    concluida: 'bg-imm-emerald/40 text-white',
  };

  return (
    <span className={clsx('rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide', colorMap[status])}>
      {labelMap[status]}
    </span>
  );
}

export function ActionPlanPanel() {
  const [tasks, setTasks] = useState(TASKS);
  const [statusFilter, setStatusFilter] = useState<'todas' | ActionTask['status']>('todas');

  const progress = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((task) => task.status === 'concluida').length;
    const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
    return {
      total,
      completed,
      percentage,
    };
  }, [tasks]);

  const countsByStatus = useMemo<Record<ActionTask['status'], number>>(
    () =>
      tasks.reduce(
        (acc, task) => {
          acc[task.status] += 1;
          return acc;
        },
        { pendente: 0, em_andamento: 0, concluida: 0 } as Record<ActionTask['status'], number>,
      ),
    [tasks],
  );

  const filteredTasks = useMemo(() => {
    if (statusFilter === 'todas') {
      return tasks;
    }

    return tasks.filter((task) => task.status === statusFilter);
  }, [statusFilter, tasks]);

  const nextReminders = useMemo(() => tasks.filter((task) => task.status !== 'concluida'), [tasks]);

  return (
    <article className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-black/20 backdrop-blur-3xl">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Plano de ação integrado</h2>
            <p className="text-sm text-white/60">
              Tarefas com acompanhamento em tempo real, progresso consolidado e lembretes conectados às notificações do Instituto.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 text-right text-sm text-white/70">
            <span className="text-3xl font-semibold text-white">{progress.percentage}%</span>
            <span className="text-xs uppercase tracking-wide text-white/50">{progress.completed} de {progress.total} etapas concluídas</span>
          </div>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full border border-white/10 bg-white/10">
          <div
            className="h-full rounded-full bg-imm-emerald/80 transition-all"
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-3xl border border-white/10 bg-white/5 p-4">
            <span className="text-xs uppercase tracking-wide text-white/60">Filtrar por status</span>
            <div className="flex flex-wrap gap-2">
              {([
                { key: 'todas', label: 'Todas as tarefas' },
                { key: 'pendente', label: 'Pendentes' },
                { key: 'em_andamento', label: 'Em andamento' },
                { key: 'concluida', label: 'Concluídas' },
              ] as const).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setStatusFilter(option.key)}
                  className={clsx(
                    'rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide transition',
                    statusFilter === option.key
                      ? 'border-white/30 bg-white/10 text-white shadow-inner'
                      : 'border-white/10 bg-white/0 text-white/70 hover:border-white/20 hover:bg-white/10 hover:text-white',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {filteredTasks.map((task) => (
            <article
              key={task.id}
              className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/10"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">{task.title}</h3>
                  <p className="text-sm text-white/60">Responsável: {task.owner}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={task.status} />
                  <PriorityBadge priority={task.priority} />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-white/70">
                <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  <span className="h-2 w-2 rounded-full bg-imm-emerald" />
                  Prazo: {task.dueDate}
                </span>
                <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/0 px-3 py-1">
                  <span className="h-2 w-2 rounded-full bg-imm-indigo" />
                  {task.reminder}
                </span>
              </div>

              <div className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-white/5 p-3 text-xs text-white/70">
                <span className="uppercase tracking-wide text-white/50">Notificações relacionadas</span>
                <div className="flex flex-wrap gap-2">
                  {task.relatedNotifications.map((notification) => (
                    <span key={notification} className="rounded-full bg-white/10 px-3 py-1 text-white/80">
                      🔔 {notification}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setTasks((prev) =>
                      prev.map((item) =>
                        item.id === task.id
                          ? {
                              ...item,
                              status: item.status === 'concluida' ? 'em_andamento' : 'concluida',
                            }
                          : item,
                      ),
                    )
                  }
                  className={clsx(
                    'self-start rounded-2xl px-4 py-2 text-sm font-semibold transition',
                    task.status === 'concluida'
                      ? 'border border-white/10 bg-white/10 text-white hover:border-white/30'
                      : 'bg-imm-emerald/80 text-white shadow-lg shadow-imm-emerald/30 hover:bg-imm-emerald',
                  )}
                >
                  {task.status === 'concluida' ? 'Reabrir tarefa' : 'Marcar como concluída'}
                </button>
              </div>
            </article>
          ))}
          {filteredTasks.length === 0 && (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
              Nenhuma tarefa para o status selecionado.
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent p-4">
          <div className="grid gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
            <span className="text-[11px] uppercase tracking-wide text-white/60">Resumo por status</span>
            <div className="flex flex-col gap-1">
              <span className="flex items-center justify-between">
                <span>Pendentes</span>
                <span className="text-sm font-semibold text-white">{countsByStatus.pendente}</span>
              </span>
              <span className="flex items-center justify-between">
                <span>Em andamento</span>
                <span className="text-sm font-semibold text-white">{countsByStatus.em_andamento}</span>
              </span>
              <span className="flex items-center justify-between">
                <span>Concluídas</span>
                <span className="text-sm font-semibold text-white">{countsByStatus.concluida}</span>
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-white/70">Próximos lembretes</h4>
            <p className="text-xs text-white/60">
              Integração direta com notificações push, e-mail e WhatsApp para garantir acompanhamento do plano de ação.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {nextReminders.map((task) => (
              <div
                key={task.id}
                className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/10 p-3 text-xs text-white/80"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">{task.title}</span>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] uppercase tracking-wide text-white/60">
                    {task.dueDate}
                  </span>
                </div>
                <p>{task.reminder}</p>
                <div className="flex flex-wrap gap-2">
                  {task.relatedNotifications.map((notification) => (
                    <span key={notification} className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      {notification}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {nextReminders.length === 0 && (
              <div className="rounded-2xl border border-white/5 bg-white/5 p-4 text-xs text-white/60">
                Nenhum lembrete pendente. Todas as tarefas foram concluídas! 🎉
              </div>
            )}
          </div>
        </aside>
      </section>
    </article>
  );
}
