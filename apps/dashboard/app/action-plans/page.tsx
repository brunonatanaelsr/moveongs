'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Shell } from '../../components/Shell';
import { PrimarySidebar } from '../../components/PrimarySidebar';
import { useRequirePermission } from '../../hooks/useRequirePermission';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import {
  listBeneficiaries,
  listActionPlans,
  createActionPlan,
  createActionPlanItem,
  updateActionPlanItem,
  type BeneficiarySummary,
  type PaginationMeta,
  type ActionPlanRecord,
  type ActionPlanItemRecord,
} from '../../lib/operations';

const STATUS_LABELS: Record<ActionItemStatus, string> = {
  pending: 'Planejada',
  in_progress: 'Em andamento',
  blocked: 'Bloqueada',
  done: 'Concluída',
};

const STATUS_ORDER: ActionItemStatus[] = ['pending', 'in_progress', 'blocked', 'done'];

type ActionItemStatus = 'pending' | 'in_progress' | 'blocked' | 'done';

type BeneficiariesResponse = { data: BeneficiarySummary[]; meta: PaginationMeta };

type ActionPlansResponse = ActionPlanRecord[];

export default function ActionPlansPage() {
  const session = useRequirePermission(['action_plans:read', 'action_plans:update', 'action_plans:create']);
  const [selectedBeneficiaryId, setSelectedBeneficiaryId] = useState<string>('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);

  const beneficiariesKey = useMemo(() => {
    if (!session) return null;
    return ['beneficiaries:list', 'action-plans', session.token] as const;
  }, [session]);

  const { data: beneficiariesResponse, isLoading: loadingBeneficiaries } = useSWR<BeneficiariesResponse>(
    beneficiariesKey,
    ([, , token]) => listBeneficiaries({ limit: 50 }, token),
  );

  useEffect(() => {
    if (beneficiariesResponse?.data?.length && !selectedBeneficiaryId) {
      setSelectedBeneficiaryId(beneficiariesResponse.data[0].id);
    }
  }, [beneficiariesResponse, selectedBeneficiaryId]);

  const actionPlansKey = useMemo(() => {
    if (!session || !selectedBeneficiaryId) return null;
    return ['action-plans:list', selectedBeneficiaryId, session.token] as const;
  }, [session, selectedBeneficiaryId]);

  const {
    data: actionPlans,
    isLoading: loadingPlans,
    mutate: mutatePlans,
  } = useSWR<ActionPlansResponse>(actionPlansKey, ([, beneficiaryId, token]) =>
    listActionPlans(beneficiaryId, { status: 'active' }, token),
  );

  const plan = actionPlans?.[0] ?? null;

  useEffect(() => {
    if (feedback) {
      const timeout = setTimeout(() => setFeedback(null), 4000);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [feedback]);

  if (session === undefined) {
    return null;
  }

  const handleCreatePlan = async () => {
    if (!session || !selectedBeneficiaryId) return;
    setIsCreatingPlan(true);
    try {
      await createActionPlan({ beneficiaryId: selectedBeneficiaryId }, session.token);
      await mutatePlans();
      setFeedback({ type: 'success', message: 'Plano de ação criado com sucesso.' });
    } catch (error) {
      console.error(error);
      setFeedback({ type: 'error', message: 'Não foi possível criar o plano. Tente novamente.' });
    } finally {
      setIsCreatingPlan(false);
    }
  };

  const handleStatusChange = async (taskId: string, status: ActionItemStatus) => {
    if (!session || !plan) return;
    setUpdatingItemId(taskId);
    try {
      await updateActionPlanItem(
        plan.id,
        taskId,
        {
          status,
          completedAt: status === 'done' ? new Date().toISOString().slice(0, 10) : null,
        },
        session.token,
      );
      await mutatePlans();
      setFeedback({ type: 'success', message: 'Status da ação atualizado.' });
    } catch (error) {
      console.error(error);
      setFeedback({ type: 'error', message: 'Não foi possível atualizar a ação.' });
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleAddTask = async () => {
    if (!session || !plan) return;
    const title = prompt('Descreva a nova ação do plano');
    if (!title) return;

    setIsCreatingTask(true);
    try {
      await createActionPlanItem(
        plan.id,
        {
          title,
          status: 'pending',
          responsible: 'Equipe IMM',
          dueDate: new Date().toISOString().slice(0, 10),
        },
        session.token,
      );
      await mutatePlans();
      setFeedback({ type: 'success', message: 'Ação adicionada ao plano.' });
    } catch (error) {
      console.error(error);
      setFeedback({ type: 'error', message: 'Não foi possível adicionar a ação.' });
    } finally {
      setIsCreatingTask(false);
    }
  };

  const beneficiaries = beneficiariesResponse?.data ?? [];

  return (
    <Shell
      title="Plano de ação personalizado"
      description="Monitore objetivos, tarefas, responsáveis e prazos das beneficiárias acompanhadas pela equipe técnica."
      sidebar={session ? <PrimarySidebar session={session} /> : null}
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_2fr]">
        <Card className="space-y-4" padding="lg">
          <header className="space-y-2">
            <p className="text-xs uppercase tracking-[0.28em] text-white/50">Beneficiária</p>
            <h2 className="text-xl font-semibold text-white">Selecione para visualizar o plano</h2>
          </header>

          {feedback && (
            <div
              className={`rounded-3xl border p-4 text-sm ${
                feedback.type === 'success'
                  ? 'border-emerald-300/40 bg-emerald-500/10 text-emerald-100'
                  : 'border-rose-400/40 bg-rose-500/10 text-rose-100'
              }`}
            >
              {feedback.message}
            </div>
          )}

          <select
            value={selectedBeneficiaryId}
            onChange={(event) => setSelectedBeneficiaryId(event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/80 focus:border-emerald-400 focus:outline-none"
            disabled={loadingBeneficiaries}
          >
            {loadingBeneficiaries && <option value="">Carregando beneficiárias...</option>}
            {!loadingBeneficiaries && beneficiaries.length === 0 && <option value="">Nenhuma beneficiária disponível</option>}
            {beneficiaries.map((beneficiary) => (
              <option key={beneficiary.id} value={beneficiary.id}>
                {beneficiary.fullName}
              </option>
            ))}
          </select>

          {plan ? (
            <div className="space-y-4 text-sm text-white/80">
              <div>
                <h3 className="text-xs uppercase tracking-[0.24em] text-white/40">Status do plano</h3>
                <p className="text-white">{plan.status === 'completed' ? 'Concluído' : plan.status === 'archived' ? 'Arquivado' : 'Ativo'}</p>
              </div>
              <div>
                <h3 className="text-xs uppercase tracking-[0.24em] text-white/40">Criado em</h3>
                <p>{formatDate(plan.createdAt)}</p>
              </div>
              <div>
                <h3 className="text-xs uppercase tracking-[0.24em] text-white/40">Última atualização</h3>
                <p>{formatDate(plan.updatedAt)}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-white/60">Nenhum plano cadastrado para esta beneficiária.</p>
          )}

          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={handleAddTask} disabled={!plan || isCreatingTask}>
              {isCreatingTask ? 'Adicionando...' : 'Adicionar ação'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleCreatePlan}
              disabled={isCreatingPlan || Boolean(plan)}
            >
              {plan ? 'Plano ativo' : isCreatingPlan ? 'Criando...' : 'Criar plano'}
            </Button>
          </div>
        </Card>

        {loadingPlans ? (
          <Card className="space-y-3" padding="lg">
            <h3 className="text-lg font-semibold text-white">Carregando plano de ação</h3>
            <p className="text-sm text-white/70">Aguarde enquanto buscamos as ações registradas para esta beneficiária.</p>
          </Card>
        ) : plan ? (
          <TasksBoard plan={plan} onStatusChange={handleStatusChange} updatingItemId={updatingItemId} />
        ) : (
          <EmptyPlanState />
        )}
      </div>
    </Shell>
  );
}

interface TasksBoardProps {
  plan: ActionPlanRecord;
  onStatusChange: (taskId: string, status: ActionItemStatus) => void;
  updatingItemId: string | null;
}

function TasksBoard({ plan, onStatusChange, updatingItemId }: TasksBoardProps) {
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
                <TaskCard task={task} updating={updatingItemId === task.id} onStatusChange={onStatusChange} />
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

interface TaskCardProps {
  task: ActionPlanItemRecord;
  updating: boolean;
  onStatusChange: (taskId: string, status: ActionItemStatus) => void;
}

function TaskCard({ task, updating, onStatusChange }: TaskCardProps) {
  return (
    <div className="space-y-3">
      <div>
        <p className="font-semibold text-white">{task.title}</p>
        {task.responsible && <p className="text-xs text-white/60">Responsável: {task.responsible}</p>}
        {task.dueDate && <p className="text-xs text-white/60">Prazo: {formatDate(task.dueDate)}</p>}
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
              disabled={updating || isActive}
              className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] transition ${
                isActive
                  ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-100'
                  : 'border-white/10 bg-white/5 text-white/60 hover:border-white/30 hover:bg-white/10 disabled:opacity-40'
              }`}
            >
              {STATUS_LABELS[status]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EmptyPlanState() {
  return (
    <Card className="space-y-4" padding="lg">
      <h3 className="text-lg font-semibold text-white">Nenhum plano cadastrado</h3>
      <p className="text-sm text-white/70">
        Selecione uma beneficiária com plano ativo ou utilize o botão de criação para iniciar um acompanhamento personalizado.
      </p>
    </Card>
  );
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString('pt-BR');
  } catch (error) {
    console.error(error);
    return value;
  }
}
