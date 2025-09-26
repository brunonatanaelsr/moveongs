'use client';

import { useEffect, useMemo, useState } from 'react';
import { Shell } from '../../components/Shell';
import { PrimarySidebar } from '../../components/PrimarySidebar';
import { useRequirePermission } from '../../hooks/useRequirePermission';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { useProjects, useCohorts } from '../../hooks/useProjects';
import { useEnrollments, type EnrollmentSummary } from '../../hooks/useEnrollments';
import { postJson } from '../../lib/api';
import { LoadingState } from '../../components/LoadingState';
import type { ProjectSummary } from '../../types/operations';

interface EnrollmentFormState {
  beneficiaryName: string;
  beneficiaryCode: string;
  contact: string;
  startDate: string;
  cohortId: string;
}

const initialFormState: EnrollmentFormState = {
  beneficiaryName: '',
  beneficiaryCode: '',
  contact: '',
  startDate: new Date().toISOString().slice(0, 10),
  cohortId: '',
};

export default function EnrollmentsPage() {
  const session = useRequirePermission(['enrollments:create']);
  const { projects, isLoading: loadingProjects } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [form, setForm] = useState<EnrollmentFormState>(initialFormState);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  const { cohorts } = useCohorts(selectedProjectId || undefined);
  useEffect(() => {
    if (cohorts.length > 0) {
      setForm((prev) => ({ ...prev, cohortId: cohorts[0].id }));
    }
  }, [cohorts]);

  const { enrollments, mutateEnrollments, isLoading: loadingEnrollments } = useEnrollments(selectedProjectId || undefined);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId),
    [projects, selectedProjectId],
  );

  const primarySidebar = useMemo(() => (session ? <PrimarySidebar session={session} /> : null), [session]);

  const notify = (message: string) => {
    setFeedback(message);
    window.setTimeout(() => setFeedback(null), 4000);
  };

  if (session === undefined || loadingProjects) {
    return <LoadingState message="Carregando dados de projetos..." />;
  }

  if (!session) {
    return <LoadingState message="Carregando..." />;
  }

  const handleInputChange = (field: keyof EnrollmentFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreateEnrollment = () => {
    if (!selectedProject) {
      notify('Selecione um projeto para registrar a inscrição.');
      return;
    }

    if (!form.beneficiaryName.trim() || !form.cohortId) {
      notify('Informe o nome da beneficiária e a turma.');
      return;
    }

    const beneficiaryId = form.beneficiaryCode.trim() || `beneficiary-${Math.random().toString(36).slice(2, 8)}`;

    const optimistic: EnrollmentSummary = {
      id: `enrollment-${Math.random().toString(36).slice(2, 10)}`,
      projectId: selectedProject.id,
      cohortId: form.cohortId,
      startDate: form.startDate,
      status: 'pendente',
      agreementsAccepted: true,
      beneficiary: {
        id: beneficiaryId,
        name: form.beneficiaryName.trim(),
      },
    };

    const snapshot = [...enrollments];
    mutateEnrollments({ data: [optimistic, ...snapshot] }, false);

    void (async () => {
      try {
        await postJson(
          '/enrollments',
          {
            projectId: selectedProject.id,
            cohortId: form.cohortId,
            beneficiary: {
              id: beneficiaryId,
              name: form.beneficiaryName.trim(),
              contact: form.contact.trim(),
            },
            startDate: form.startDate,
            agreementsAccepted: true,
          },
          session.token,
        );
        await mutateEnrollments();
        setForm((prev) => ({ ...initialFormState, cohortId: prev.cohortId || cohorts[0]?.id || '' }));
        notify('Inscrição registrada e enviada para a API.');
      } catch (error) {
        await mutateEnrollments({ data: snapshot }, false);
        notify('Não foi possível registrar a inscrição. Tente novamente.');
      }
    })();
  };

  return (
    <Shell
      title="Inscrições em projetos"
      description="Gerencie inscrições, turmas e lista de espera das beneficiárias de forma centralizada."
      sidebar={primarySidebar}
    >
      {feedback && (
        <div className="mb-6 rounded-3xl border border-emerald-300/40 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          {feedback}
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Card className="space-y-6" padding="lg">
          <header className="space-y-1">
            <p className="text-xs uppercase tracking-[0.28em] text-white/50">Nova inscrição</p>
            <h2 className="text-2xl font-semibold text-white">Configure projeto, turma e data de início</h2>
          </header>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="project" className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
                Projeto
              </label>
              <select
                id="project"
                value={selectedProjectId}
                onChange={(event) => {
                  setSelectedProjectId(event.target.value);
                  setForm((prev) => ({ ...prev, cohortId: '' }));
                }}
                className="w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/80 focus:border-emerald-400 focus:outline-none"
              >
                {projects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="cohort" className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
                Turma
              </label>
              <select
                id="cohort"
                value={form.cohortId}
                onChange={(event) => handleInputChange('cohortId', event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/80 focus:border-emerald-400 focus:outline-none"
              >
                {cohorts.length === 0 && <option value="">Nenhuma turma disponível</option>}
                {cohorts.map((cohort) => (
                  <option key={cohort.id} value={cohort.id}>
                    {cohort.name} • {cohort.schedule}
                  </option>
                ))}
              </select>
            </div>

            <Input
              id="beneficiary-name"
              label="Nome da beneficiária"
              placeholder="Digite o nome completo"
              value={form.beneficiaryName}
              onChange={(event) => handleInputChange('beneficiaryName', event.target.value)}
            />

            <Input
              id="beneficiary-code"
              label="Código de matrícula (opcional)"
              placeholder="IMM-2024-001"
              value={form.beneficiaryCode}
              onChange={(event) => handleInputChange('beneficiaryCode', event.target.value)}
            />

            <Input
              id="beneficiary-contact"
              label="Contato telefônico"
              placeholder="(11) 90000-0000"
              value={form.contact}
              onChange={(event) => handleInputChange('contact', event.target.value)}
            />

            <Input
              id="startDate"
              type="date"
              label="Data de início"
              value={form.startDate}
              onChange={(event) => handleInputChange('startDate', event.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={handleCreateEnrollment}>
              Registrar inscrição
            </Button>
            <Button type="button" variant="secondary" disabled>
              Exportar comprovante
            </Button>
          </div>
        </Card>

        <ProjectOverviewCard project={selectedProject} cohorts={cohorts} loading={loadingEnrollments} />
      </div>

      <EnrollmentTable enrollments={enrollments} cohorts={cohorts} />
    </Shell>
  );
}

interface ProjectOverviewCardProps {
  project?: ProjectSummary;
  cohorts: ProjectSummary['cohorts'];
  loading: boolean;
}

function ProjectOverviewCard({ project, cohorts, loading }: ProjectOverviewCardProps) {
  if (!project) {
    return (
      <Card className="space-y-4" padding="lg">
        <p className="text-sm text-white/60">Selecione um projeto para visualizar capacidade e turmas.</p>
      </Card>
    );
  }

  return (
    <Card className="space-y-4" padding="lg">
      <header>
        <p className="text-xs uppercase tracking-[0.28em] text-white/50">Capacidade do projeto</p>
        <h3 className="mt-1 text-xl font-semibold text-white">{project.name}</h3>
        <p className="mt-2 text-xs text-white/70">{project.description}</p>
      </header>

      <dl className="grid grid-cols-2 gap-4 text-sm text-white/80">
        <div>
          <dt className="text-xs uppercase tracking-[0.24em] text-white/40">Capacidade</dt>
          <dd className="text-lg text-white">{project.capacity}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.24em] text-white/40">Matriculadas</dt>
          <dd className="text-lg text-white">{project.activeEnrollments}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.24em] text-white/40">Lista de espera</dt>
          <dd className="text-lg text-white">{project.riskAlerts}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.24em] text-white/40">Status</dt>
          <dd>{loading ? 'Sincronizando inscrições...' : 'Dados atualizados'}</dd>
        </div>
      </dl>

      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-[0.24em] text-white/50">Turmas disponíveis</h4>
        <ul className="space-y-2 text-xs text-white/70">
          {cohorts.map((cohort) => (
            <li key={cohort.id} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
              <p className="font-medium text-white">{cohort.name}</p>
              <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">{cohort.schedule}</p>
            </li>
          ))}
        </ul>
      </section>
    </Card>
  );
}

interface EnrollmentTableProps {
  enrollments: EnrollmentSummary[];
  cohorts: ProjectSummary['cohorts'];
}

function EnrollmentTable({ enrollments, cohorts }: EnrollmentTableProps) {
  if (enrollments.length === 0) {
    return (
      <Card className="space-y-3" padding="lg">
        <h3 className="text-lg font-semibold text-white">Nenhuma inscrição cadastrada</h3>
        <p className="text-sm text-white/70">
          Use o formulário acima para registrar novas inscrições e acompanhar o status de aprovação com a coordenação.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden" padding="lg">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-white/50">Histórico</p>
          <h3 className="text-xl font-semibold text-white">Inscrições do projeto selecionado</h3>
        </div>
        <Button type="button" variant="secondary" disabled>
          Exportar para planilha
        </Button>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full divide-y divide-white/10 text-sm text-white/80">
          <thead className="text-xs uppercase tracking-[0.22em] text-white/40">
            <tr>
              <th className="px-4 py-3 text-left">Beneficiária</th>
              <th className="px-4 py-3 text-left">Turma</th>
              <th className="px-4 py-3 text-left">Início</th>
              <th className="px-4 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {enrollments.map((enrollment) => {
              const cohort = cohorts.find((item) => item.id === enrollment.cohortId);
              return (
                <tr key={enrollment.id} className="bg-white/0">
                  <td className="px-4 py-3 text-white">{enrollment.beneficiary.name}</td>
                  <td className="px-4 py-3">{cohort ? cohort.name : enrollment.cohortId}</td>
                  <td className="px-4 py-3">{new Date(enrollment.startDate).toLocaleDateString('pt-BR')}</td>
                  <td className="px-4 py-3 capitalize">{enrollment.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
