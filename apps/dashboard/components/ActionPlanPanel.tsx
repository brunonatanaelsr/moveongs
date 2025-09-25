'use client';

import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { useActionPlans, useBeneficiaries } from '../hooks/useActionPlans';
import type { ActionPlanItem } from '../types/action-plans';

function normalizeStatus(status: string | null | undefined): 'pendente' | 'em_andamento' | 'concluida' | 'bloqueada' {
  const value = status?.toLowerCase() ?? '';
  if (['done', 'completed', 'concluida', 'complete'].includes(value)) {
    return 'concluida';
  }
  if (['in_progress', 'progress', 'ongoing', 'em_andamento'].includes(value)) {
    return 'em_andamento';
  }
  if (['blocked', 'on_hold', 'bloqueada'].includes(value)) {
    return 'bloqueada';
  }
  return 'pendente';
}

function statusLabel(status: 'pendente' | 'em_andamento' | 'concluida' | 'bloqueada') {
  const map: Record<typeof status, string> = {
    pendente: 'Pendente',
    em_andamento: 'Em andamento',
    concluida: 'Concluída',
    bloqueada: 'Bloqueada',
  };
  return map[status];
}

function statusClass(status: 'pendente' | 'em_andamento' | 'concluida' | 'bloqueada') {
  const map: Record<typeof status, string> = {
    pendente: 'bg-white/10 text-white',
    em_andamento: 'bg-imm-indigo/30 text-imm-indigo-100',
    concluida: 'bg-imm-emerald/40 text-white',
    bloqueada: 'bg-rose-500/30 text-rose-100',
  };
  return map[status];
}

function formatDate(value: string | null) {
  if (!value) {
    return 'Sem prazo';
  }
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'Sem prazo';
    }
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date);
  } catch {
    return 'Sem prazo';
  }
}

function sortByDueDate(a: ActionPlanItem, b: ActionPlanItem) {
  if (!a.dueDate && !b.dueDate) return 0;
  if (!a.dueDate) return 1;
  if (!b.dueDate) return -1;
  return a.dueDate.localeCompare(b.dueDate);
}

export function ActionPlanPanel() {
  const { beneficiaries, isLoading: loadingBeneficiaries, error: beneficiariesError } = useBeneficiaries(12);
  const [selectedBeneficiaryId, setSelectedBeneficiaryId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'todas' | 'pendente' | 'em_andamento' | 'concluida' | 'bloqueada'>('todas');

  const beneficiaryOptions = useMemo(() => {
    return beneficiaries.map((beneficiary) => ({ id: beneficiary.id, name: beneficiary.fullName }));
  }, [beneficiaries]);

  const currentBeneficiaryId = useMemo(() => {
    if (selectedBeneficiaryId) {
      return selectedBeneficiaryId;
    }
    return beneficiaryOptions[0]?.id ?? null;
  }, [beneficiaryOptions, selectedBeneficiaryId]);

  const { plans, isLoading: loadingPlans, error: plansError } = useActionPlans(currentBeneficiaryId, { status: 'active' });

  const tasks = useMemo(() => {
    return plans.flatMap((plan) =>
      plan.items.map((item) => ({
        ...item,
        normalizedStatus: normalizeStatus(item.status),
        beneficiaryId: plan.beneficiaryId,
      })),
    );
  }, [plans]);

  const progress = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((task) => task.normalizedStatus === 'concluida').length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, percentage };
  }, [tasks]);

  const countsByStatus = useMemo(() => {
    return tasks.reduce(
      (acc, task) => {
        acc[task.normalizedStatus] += 1;
        return acc;
      },
      { pendente: 0, em_andamento: 0, concluida: 0, bloqueada: 0 } as Record<'pendente' | 'em_andamento' | 'concluida' | 'bloqueada', number>,
    );
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    if (statusFilter === 'todas') {
      return tasks;
    }
    return tasks.filter((task) => task.normalizedStatus === statusFilter);
  }, [tasks, statusFilter]);

  const upcomingTasks = useMemo(() => {
    return tasks
      .filter((task) => task.normalizedStatus !== 'concluida')
      .slice()
      .sort(sortByDueDate)
      .slice(0, 4);
  }, [tasks]);

  return (
    <section className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-black/20 backdrop-blur-3xl">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Planos de ação</h2>
          <p className="text-sm text-white/60">
            Acompanhe tarefas vinculadas às beneficiárias, com status consolidado e próximos prazos.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 text-right text-sm text-white/70">
          <span className="text-3xl font-semibold text-white">{progress.percentage}%</span>
          <span className="text-xs uppercase tracking-wide text-white/50">
            {progress.completed} de {progress.total} etapas concluídas
          </span>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs uppercase tracking-wide text-white/60">Beneficiária</span>
              <div className="flex items-center gap-3">
                {loadingBeneficiaries && <span className="text-xs text-white/50">Carregando...</span>}
                {beneficiariesError && (
                  <span className="rounded-full border border-rose-400/40 bg-rose-500/10 px-3 py-1 text-xs text-rose-100">
                    Erro ao carregar lista
                  </span>
                )}
              </div>
            </div>
            <select
              value={currentBeneficiaryId ?? ''}
              onChange={(event) => setSelectedBeneficiaryId(event.target.value || null)}
              className="h-10 rounded-2xl border border-white/20 bg-black/20 px-3 text-sm text-white shadow-inner shadow-black/20 focus:border-white/40 focus:outline-none"
            >
              {beneficiaryOptions.length === 0 && <option value="">Nenhuma beneficiária encontrada</option>}
              {beneficiaryOptions.map((beneficiary) => (
                <option key={beneficiary.id} value={beneficiary.id} className="bg-slate-900 text-white">
                  {beneficiary.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-3xl border border-white/10 bg-white/5 p-4">
            <span className="text-xs uppercase tracking-wide text-white/60">Filtrar por status</span>
            <div className="flex flex-wrap gap-2">
              {([
                { key: 'todas', label: 'Todas' },
                { key: 'pendente', label: `Pendentes (${countsByStatus.pendente})` },
                { key: 'em_andamento', label: `Em andamento (${countsByStatus.em_andamento})` },
                { key: 'concluida', label: `Concluídas (${countsByStatus.concluida})` },
                { key: 'bloqueada', label: `Bloqueadas (${countsByStatus.bloqueada})` },
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

          {plansError && (
            <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-100">
              Não foi possível carregar os planos de ação.
            </div>
          )}

          {loadingPlans && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
              Carregando planos e tarefas...
            </div>
          )}

          {!loadingPlans && filteredTasks.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
              Nenhuma tarefa encontrada para os filtros atuais.
            </div>
          )}

          {filteredTasks.map((task) => (
            <article
              key={task.id}
              className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/10"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">{task.title}</h3>
                  <p className="text-sm text-white/60">Responsável: {task.responsible ?? 'Não atribuído'}</p>
                </div>
                <span className={clsx('rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide', statusClass(task.normalizedStatus))}>
                  {statusLabel(task.normalizedStatus)}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-white/70">
                <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  <span className="h-2 w-2 rounded-full bg-imm-emerald" /> Prazo: {formatDate(task.dueDate)}
                </span>
                <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/0 px-3 py-1">
                  <span className="h-2 w-2 rounded-full bg-imm-indigo" /> Status original: {task.status ?? 'não informado'}
                </span>
              </div>

              {(task.support || task.notes) && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                  {task.support && (
                    <p>
                      <span className="font-semibold text-white/80">Apoio necessário:</span> {task.support}
                    </p>
                  )}
                  {task.notes && (
                    <p>
                      <span className="font-semibold text-white/80">Observações:</span> {task.notes}
                    </p>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>

        <aside className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-white/70">Próximos prazos</h3>
          {upcomingTasks.length === 0 && (
            <p className="text-sm text-white/60">Nenhuma tarefa pendente para os próximos dias.</p>
          )}
          {upcomingTasks.map((task) => (
            <div key={task.id} className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center justify-between text-xs text-white/60">
                <span>Prazo</span>
                <span className="font-semibold text-white">{formatDate(task.dueDate)}</span>
              </div>
              <p className="text-sm font-medium text-white">{task.title}</p>
              <p className="text-xs text-white/60">Responsável: {task.responsible ?? 'Não atribuído'}</p>
              <span className={clsx('w-fit rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide', statusClass(task.normalizedStatus))}>
                {statusLabel(task.normalizedStatus)}
              </span>
            </div>
          ))}
        </aside>
      </div>
    </section>
  );
}
