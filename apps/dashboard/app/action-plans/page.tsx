'use client';

import { useState } from 'react';
import { Shell } from '../../components/Shell';
import { PrimarySidebar } from '../../components/PrimarySidebar';
import { useRequirePermission } from '../../hooks/useRequirePermission';
import { Card } from '../../components/ui/card';
import { useProjects, useCohorts } from '../../hooks/useProjects';
import { useEnrollments } from '../../hooks/useEnrollments';
import { useActionPlans } from '../../hooks/useActionPlans';
import type { ActionPlanStatus, ActionItemStatus } from '../../types/action-plans';
import { LoadingState } from '../../components/LoadingState';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { post, patch } from '../../lib/api';

const planStatusOptions: { value: ActionPlanStatus; label: string }[] = [
  { value: 'draft', label: 'Rascunho' },
  { value: 'active', label: 'Ativo' },
  { value: 'completed', label: 'Concluído' },
  { value: 'archived', label: 'Arquivado' },
];

const itemStatusOptions: { value: ActionItemStatus; label: string }[] = [
  { value: 'pending', label: 'Pendente' },
  { value: 'in_progress', label: 'Em Andamento' },
  { value: 'completed', label: 'Concluído' },
  { value: 'blocked', label: 'Bloqueado' },
];

export default function ActionPlansPage() {
  const session = useRequirePermission(['action-plans:read', 'action-plans:manage']);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedCohortId, setSelectedCohortId] = useState<string | null>(null);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  const [newPlanTitle, setNewPlanTitle] = useState('');
  const [newPlanDescription, setNewPlanDescription] = useState('');
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemDescription, setNewItemDescription] = useState('');
  const [newItemDueDate, setNewItemDueDate] = useState('');

  const { data: projects, error: projectsError, isLoading: loadingProjects } = useProjects();
  const { data: cohorts, error: cohortsError, isLoading: loadingCohorts } = useCohorts(selectedProjectId);
  const { data: enrollments, error: enrollmentsError, isLoading: loadingEnrollments } = useEnrollments(selectedCohortId);
  const { data: plans, error: plansError, isLoading: loadingPlans, mutate: mutatePlans } = useActionPlans(selectedEnrollmentId);

  const activeProjectId = selectedProjectId ?? projects?.[0]?.id ?? null;
  const activeCohortId = selectedCohortId ?? cohorts?.[0]?.id ?? null;

  const handleCreatePlan = async () => {
    if (!selectedEnrollmentId || !newPlanTitle || !session?.token) return;

    try {
      setSubmitting(true);
      setFeedback(null);

      await post(
        '/action-plans',
        {
          body: {
            enrollmentId: selectedEnrollmentId,
            title: newPlanTitle,
            description: newPlanDescription,
          },
        },
        session.token,
      );

      await mutatePlans();
      setNewPlanTitle('');
      setNewPlanDescription('');
      setFeedback('Plano de ação criado com sucesso!');
    } catch (error) {
      console.error(error);
      setFeedback('Erro ao criar plano de ação');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdatePlanStatus = async (planId: string, status: ActionPlanStatus) => {
    if (!session?.token) return;

    try {
      setSubmitting(true);
      setFeedback(null);

      await patch(
        `/action-plans/${planId}`,
        { body: { status } },
        session.token,
      );

      await mutatePlans();
      setFeedback('Status do plano atualizado com sucesso!');
    } catch (error) {
      console.error(error);
      setFeedback('Erro ao atualizar status do plano');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateItem = async (planId: string) => {
    if (!newItemTitle || !session?.token) return;

    try {
      setSubmitting(true);
      setFeedback(null);

      await post(
        `/action-plans/${planId}/items`,
        {
          body: {
            title: newItemTitle,
            description: newItemDescription,
            dueDate: newItemDueDate || null,
          },
        },
        session.token,
      );

      await mutatePlans();
      setNewItemTitle('');
      setNewItemDescription('');
      setNewItemDueDate('');
      setFeedback('Item criado com sucesso!');
    } catch (error) {
      console.error(error);
      setFeedback('Erro ao criar item');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateItemStatus = async (
    planId: string,
    itemId: string,
    status: ActionItemStatus,
  ) => {
    if (!session?.token) return;

    try {
      setSubmitting(true);
      setFeedback(null);

      await patch(
        `/action-plans/${planId}/items/${itemId}`,
        { body: { status } },
        session.token,
      );

      await mutatePlans();
      setFeedback('Status do item atualizado com sucesso!');
    } catch (error) {
      console.error(error);
      setFeedback('Erro ao atualizar status do item');
    } finally {
      setSubmitting(false);
    }
  };

  if (!session) {
    return null;
  }

  if (projectsError || cohortsError || enrollmentsError || plansError) {
    return (
      <Shell>
        <div className="flex items-center justify-center h-full">
          <p className="text-red-500">
            Erro ao carregar dados. Por favor, tente novamente mais tarde.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="container mx-auto p-4">
        <div className="grid grid-cols-12 gap-4">
          <aside className="col-span-3">
            <PrimarySidebar />
          </aside>

          <main className="col-span-9">
            <Card className="p-4">
              <h1 className="text-2xl font-bold mb-4">Planos de Ação</h1>

              <div className="space-y-4">
                {/* Seleção de projeto */}
                <div>
                  <label className="block text-sm font-medium mb-1">Projeto</label>
                  {loadingProjects ? (
                    <LoadingState />
                  ) : (
                    <select
                      className="w-full p-2 border rounded"
                      value={activeProjectId ?? ''}
                      onChange={(e) => {
                        setSelectedProjectId(e.target.value || null);
                        setSelectedCohortId(null);
                        setSelectedEnrollmentId(null);
                      }}
                    >
                      <option value="">Selecione um projeto</option>
                      {projects?.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Seleção de turma */}
                <div>
                  <label className="block text-sm font-medium mb-1">Turma</label>
                  {loadingCohorts ? (
                    <LoadingState />
                  ) : (
                    <select
                      className="w-full p-2 border rounded"
                      value={activeCohortId ?? ''}
                      onChange={(e) => {
                        setSelectedCohortId(e.target.value || null);
                        setSelectedEnrollmentId(null);
                      }}
                      disabled={!activeProjectId}
                    >
                      <option value="">Selecione uma turma</option>
                      {cohorts?.map((cohort) => (
                        <option key={cohort.id} value={cohort.id}>
                          {cohort.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Seleção de beneficiário */}
                <div>
                  <label className="block text-sm font-medium mb-1">Beneficiário</label>
                  {loadingEnrollments ? (
                    <LoadingState />
                  ) : (
                    <select
                      className="w-full p-2 border rounded"
                      value={selectedEnrollmentId ?? ''}
                      onChange={(e) => setSelectedEnrollmentId(e.target.value || null)}
                      disabled={!activeCohortId}
                    >
                      <option value="">Selecione um beneficiário</option>
                      {enrollments?.map((enrollment) => (
                        <option key={enrollment.id} value={enrollment.id}>
                          {enrollment.beneficiaryName}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Formulário de novo plano */}
                {selectedEnrollmentId && session.permissions.includes('action-plans:manage') && (
                  <div className="mt-4 p-4 border rounded">
                    <h2 className="text-lg font-semibold mb-2">Novo Plano de Ação</h2>
                    <div className="space-y-2">
                      <Input
                        type="text"
                        placeholder="Título do plano"
                        value={newPlanTitle}
                        onChange={(e) => setNewPlanTitle(e.target.value)}
                      />
                      <Input
                        type="text"
                        placeholder="Descrição"
                        value={newPlanDescription}
                        onChange={(e) => setNewPlanDescription(e.target.value)}
                      />
                      <Button
                        onClick={handleCreatePlan}
                        disabled={submitting || !newPlanTitle}
                        className="bg-primary text-white"
                      >
                        {submitting ? 'Criando...' : 'Criar Plano'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Lista de planos */}
                {loadingPlans ? (
                  <LoadingState />
                ) : (
                  plans?.length && (
                    <div className="mt-4">
                      <h2 className="text-lg font-semibold mb-2">Planos Existentes</h2>
                      <div className="space-y-4">
                        {plans.map((plan) => (
                          <div key={plan.id} className="p-4 border rounded">
                            <div className="flex items-center justify-between mb-2">
                              <h3 className="text-md font-semibold">{plan.title}</h3>
                              {session.permissions.includes('action-plans:manage') && (
                                <select
                                  className="p-1 border rounded"
                                  value={plan.status}
                                  onChange={(e) =>
                                    handleUpdatePlanStatus(
                                      plan.id,
                                      e.target.value as ActionPlanStatus,
                                    )
                                  }
                                  disabled={submitting}
                                >
                                  {planStatusOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>

                            {plan.description && (
                              <p className="text-sm text-gray-600 mb-4">
                                {plan.description}
                              </p>
                            )}

                            {/* Lista de itens */}
                            <div className="space-y-2">
                              {plan.items?.map((item) => (
                                <div
                                  key={item.id}
                                  className="flex items-center justify-between p-2 bg-gray-50 rounded"
                                >
                                  <div>
                                    <span className="font-medium">{item.title}</span>
                                    {item.description && (
                                      <p className="text-sm text-gray-600">
                                        {item.description}
                                      </p>
                                    )}
                                    {item.dueDate && (
                                      <p className="text-sm text-gray-500">
                                        Prazo: {new Date(item.dueDate).toLocaleDateString()}
                                      </p>
                                    )}
                                  </div>
                                  {session.permissions.includes('action-plans:manage') && (
                                    <select
                                      className="p-1 border rounded"
                                      value={item.status}
                                      onChange={(e) =>
                                        handleUpdateItemStatus(
                                          plan.id,
                                          item.id,
                                          e.target.value as ActionItemStatus,
                                        )
                                      }
                                      disabled={submitting}
                                    >
                                      {itemStatusOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </div>
                              ))}
                            </div>

                            {/* Formulário de novo item */}
                            {session.permissions.includes('action-plans:manage') && (
                              <div className="mt-4 space-y-2">
                                <Input
                                  type="text"
                                  placeholder="Título do item"
                                  value={newItemTitle}
                                  onChange={(e) => setNewItemTitle(e.target.value)}
                                />
                                <Input
                                  type="text"
                                  placeholder="Descrição"
                                  value={newItemDescription}
                                  onChange={(e) => setNewItemDescription(e.target.value)}
                                />
                                <Input
                                  type="date"
                                  value={newItemDueDate}
                                  onChange={(e) => setNewItemDueDate(e.target.value)}
                                />
                                <Button
                                  onClick={() => handleCreateItem(plan.id)}
                                  disabled={submitting || !newItemTitle}
                                  className="bg-primary text-white"
                                >
                                  {submitting ? 'Criando...' : 'Adicionar Item'}
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                )}

                {feedback && (
                  <p
                    className={`mt-4 text-sm ${
                      feedback.includes('Erro') ? 'text-red-500' : 'text-green-500'
                    }`}
                  >
                    {feedback}
                  </p>
                )}
              </div>
            </Card>
          </main>
        </div>
      </div>
    </Shell>
  );
}
