'use client';

import { useMemo, useState } from 'react';
import { Shell } from '../../components/Shell';
import { PrimarySidebar } from '../../components/PrimarySidebar';
import { useRequirePermission } from '../../hooks/useRequirePermission';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { BENEFICIARIES } from '../../data/mockOperations';
import type { ActionPlan, ActionItem } from '../../types/operations';

const STATUS_LABELS: Record<ActionItem['status'], string> = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  atrasada: 'Atrasada',
};

const STATUS_ORDER: ActionItem['status'][] = ['pendente', 'em_andamento', 'atrasada', 'concluida'];

export default function ActionPlansPage() {
  const session = useRequirePermission(['action-plans:read', 'action-plans:write']);
  const [selectedBeneficiaryId, setSelectedBeneficiaryId] = useState<string>(BENEFICIARIES[0]?.id ?? '');
  const [plans, setPlans] = useState<Record<string, ActionPlan>>(
    Object.fromEntries(BENEFICIARIES.map((beneficiary) => [beneficiary.id, beneficiary.actionPlan]))
  );

  const plan = plans[selectedBeneficiaryId] ?? null;
  const primarySidebar = useMemo(() => (session ? <PrimarySidebar session={session} /> : null), [session]);

  if (session === undefined) {
    return null;
  }

  const handleStatusChange = (taskId: string, status: ActionItem['status']) => {
    if (!plan) return;
    setPlans((prev) => {
      const current = prev[selectedBeneficiaryId] ?? plan;
      return {
        ...prev,
        [selectedBeneficiaryId]: {
          ...current,
          tasks: current.tasks.map((task) => (task.id === taskId ? { ...task, status } : task)),
        },
      };
    });
  };

  const handleAddTask = () => {
    if (!plan) return;
    const title = prompt('Descreva a nova ação do plano');
    if (!title) return;

    const newTask: ActionItem = {
      id: `task-${Date.now()}`,
      title,
      status: 'pendente',
      responsible: 'Equipe IMM',
      dueDate: new Date().toISOString().slice(0, 10),
      support: 'Definir recursos necessários',
    };

    setPlans((prev) => {
      const current = prev[selectedBeneficiaryId] ?? plan;
      return {
        ...prev,
        [selectedBeneficiaryId]: {
          ...current,
          tasks: [newTask, ...current.tasks],
        },
      };
    });
  };

  return (
    <Shell
      title="Plano de ação personalizado"
      description="Monitore objetivos, tarefas, responsáveis e prazos das beneficiárias acompanhadas pela equipe técnica."
      sidebar={primarySidebar}
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_2fr]">
        <Card className="space-y-4" padding="lg">
          <header className="space-y-2">
            <p className="text-xs uppercase tracking-[0.28em] text-white/50">Beneficiária</p>
            <h2 className="text-xl font-semibold text-white">Selecione para visualizar o plano</h2>
          </header>

          <select
            value={selectedBeneficiaryId}
            onChange={(event) => setSelectedBeneficiaryId(event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/80 focus:border-emerald-400 focus:outline-none"
          >
            {BENEFICIARIES.map((beneficiary) => (
              <option key={beneficiary.id} value={beneficiary.id}>
                {beneficiary.name}
              </option>
            ))}
          </select>

          {plan ? (
            <div className="space-y-4 text-sm text-white/80">
              <div>
                <h3 className="text-xs uppercase tracking-[0.24em] text-white/40">Objetivo</h3>
                <p className="text-white">{plan.objective}</p>
              </div>
            <div>
              <h3 className="text-xs uppercase tracking-[0.24em] text-white/40">Áreas prioritárias</h3>
              <p>{plan.priorityAreas.join(' • ')}</p>
            </div>
              <div>
                <h3 className="text-xs uppercase tracking-[0.24em] text-white/40">Criado em</h3>
                <p>{plan.createdAt}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-white/60">Nenhum plano cadastrado para esta beneficiária.</p>
          )}

          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={handleAddTask} disabled={!plan}>
              Adicionar ação
            </Button>
            <Button type="button" variant="secondary">
              Exportar plano completo
            </Button>
          </div>
        </Card>

        {plan ? <TasksBoard plan={plan} onStatusChange={handleStatusChange} /> : <EmptyPlanState />}
      </div>
    </Shell>
  );
}

interface TasksBoardProps {
  plan: ActionPlan;
  onStatusChange: (taskId: string, status: ActionItem['status']) => void;
}

function TasksBoard({ plan, onStatusChange }: TasksBoardProps) {
  const grouped = STATUS_ORDER.map((status) => ({
    status,
    tasks: plan.items.filter((task) => task.status === status),
  }));

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {grouped.map((column) => (
        <Card key={column.status} className="space-y-3" padding="lg">
          <header className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">{STATUS_LABELS[column.status]}</h3>
            <span className="text-xs text-white/60">{column.tasks.length}</span>
          </header>

          <ul className="space-y-3 text-sm text-white/80">
            {column.tasks.length === 0 && <li className="text-xs text-white/40">Nenhuma ação nesta coluna.</li>}
            {column.tasks.map((task) => (
              <li key={task.id} className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div>
                  <p className="font-semibold text-white">{task.title}</p>
                  <p className="text-xs text-white/60">Responsável: {task.responsible}</p>
                  <p className="text-xs text-white/60">Prazo: {task.dueDate}</p>
                </div>
                {task.support && <p className="text-xs text-white/60">Suporte IMM: {task.support}</p>}
                {task.notes && <p className="text-xs text-white/60">Notas: {task.notes}</p>}
                <div className="flex flex-wrap gap-2">
                  {STATUS_ORDER.map((status) => {
                    const isActive = status === task.status;
                    return (
                      <button
                        key={status}
                        type="button"
                        onClick={() => onStatusChange(task.id, status)}
                        className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] transition ${
                          isActive
                            ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-100'
                            : 'border-white/10 bg-white/5 text-white/60 hover:border-white/30 hover:bg-white/10'
                        }`}
                      >
                        {STATUS_LABELS[status]}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function EmptyPlanState() {
  return (
    <Card className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-white/60" padding="lg">
      <p>Nenhum plano encontrado para esta beneficiária.</p>
      <p className="text-xs text-white/40">Cadastre um plano via API ou use o fluxo de onboarding para iniciar um plano personalizado.</p>
    </Card>
  );
}
