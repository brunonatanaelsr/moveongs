'use client';

import { useEffect, useMemo, useState } from 'react';
import { Shell } from '../../components/Shell';
import { PrimarySidebar } from '../../components/PrimarySidebar';
import { useRequirePermission } from '../../hooks/useRequirePermission';
import { Card } from '../../components/ui/card';
import { useProjects, useCohorts } from '../../hooks/useProjects';
import { useEnrollments } from '../../hooks/useEnrollments';
import type { EnrollmentStatus } from '../../types/enrollments';
import { LoadingState } from '../../components/LoadingState';
import { patch } from '../../lib/api';

const statusOptions: { value: EnrollmentStatus; label: string }[] = [
  { value: 'pending', label: 'Pendente' },
  { value: 'active', label: 'Ativo' },
  { value: 'completed', label: 'Concluído' },
  { value: 'dropped', label: 'Desistente' },
  { value: 'expelled', label: 'Expulso' },
  { value: 'suspended', label: 'Suspenso' },
];

export default function EnrollmentsPage() {
  const session = useRequirePermission(['enrollments:read', 'enrollments:manage']);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedCohortId, setSelectedCohortId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [updatingEnrollmentId, setUpdatingEnrollmentId] = useState<string | null>(null);

  const { data: projects, error: projectsError, isLoading: loadingProjects } = useProjects();
  const { data: cohorts, error: cohortsError, isLoading: loadingCohorts } = useCohorts(selectedProjectId);
  
  const activeProjectId = selectedProjectId ?? projects?.[0]?.id ?? null;
  const activeCohortId = selectedCohortId ?? cohorts?.[0]?.id ?? null;

  const {
    data: enrollments,
    error: enrollmentsError,
    isLoading: loadingEnrollments,
    mutate: mutateEnrollments,
  } = useEnrollments(activeCohortId);

  const handleStatusChange = async (enrollmentId: string, newStatus: EnrollmentStatus) => {
    if (!session?.token) return;

    try {
      setUpdatingEnrollmentId(enrollmentId);
      setFeedback(null);

      await patch(
        `/enrollments/${enrollmentId}/status`,
        { body: { status: newStatus } },
        session.token,
      );

      await mutateEnrollments();
      setFeedback('Status atualizado com sucesso');
    } catch (error) {
      console.error(error);
      setFeedback('Erro ao atualizar status');
    } finally {
      setUpdatingEnrollmentId(null);
    }
  };

  if (!session) {
    return null;
  }

  if (projectsError || cohortsError || enrollmentsError) {
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
              <h1 className="text-2xl font-bold mb-4">Inscrições</h1>

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
                      onChange={(e) => setSelectedCohortId(e.target.value || null)}
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

                {/* Lista de inscrições */}
                {loadingEnrollments ? (
                  <LoadingState />
                ) : (
                  enrollments?.length && (
                    <div className="mt-4">
                      <h2 className="text-lg font-semibold mb-2">Inscrições</h2>
                      <div className="space-y-2">
                        {enrollments.map((enrollment) => (
                          <div
                            key={enrollment.id}
                            className="flex items-center justify-between p-2 bg-gray-50 rounded"
                          >
                            <span>{enrollment.beneficiaryName}</span>
                            <select
                              className="p-1 border rounded"
                              value={enrollment.status}
                              onChange={(e) =>
                                handleStatusChange(
                                  enrollment.id,
                                  e.target.value as EnrollmentStatus,
                                )
                              }
                              disabled={
                                updatingEnrollmentId === enrollment.id ||
                                !session.permissions.includes('enrollments:manage')
                              }
                            >
                              {statusOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>

                      {feedback && (
                        <p
                          className={`mt-4 text-sm ${
                            feedback.includes('Erro')
                              ? 'text-red-500'
                              : 'text-green-500'
                          }`}
                        >
                          {feedback}
                        </p>
                      )}
                    </div>
                  )
                )}
              </div>
            </Card>
          </main>
        </div>
      </div>
    </Shell>
  );
}
