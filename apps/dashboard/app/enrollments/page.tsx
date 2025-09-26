'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Shell } from '../../components/Shell';
import { PrimarySidebar } from '../../components/PrimarySidebar';
import { useRequirePermission } from '../../hooks/useRequirePermission';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  listProjects,
  listProjectCohorts,
  listBeneficiaries,
  listEnrollments,
  createEnrollment,
  type ProjectRecord,
  type CohortRecord,
  type BeneficiarySummary,
  type EnrollmentRecord,
  type PaginationMeta,
} from '../../lib/operations';

const ENROLLMENT_PAGE_SIZE = 10;

const ENROLLMENT_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  active: { label: 'Ativa', className: 'bg-emerald-500/20 text-emerald-100 border-emerald-400/40' },
  suspended: { label: 'Suspensa', className: 'bg-amber-500/15 text-amber-100 border-amber-400/30' },
  terminated: { label: 'Desligada', className: 'bg-rose-500/15 text-rose-100 border-rose-400/30' },
};

export default function EnrollmentsPage() {
  const session = useRequirePermission(['enrollments:read:project', 'enrollments:create:project']);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedCohortId, setSelectedCohortId] = useState<string>('');
  const [selectedBeneficiaryId, setSelectedBeneficiaryId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [beneficiarySearch, setBeneficiarySearch] = useState('');
  const [enrollmentOffset, setEnrollmentOffset] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const projectsKey = useMemo(() => {
    if (!session) return null;
    return ['projects:list', session.token] as const;
  }, [session]);

  const { data: projects, isLoading: loadingProjects } = useSWR<ProjectRecord[]>(
    projectsKey,
    ([, token]) => listProjects(token),
  );

  useEffect(() => {
    if (projects?.length && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  const cohortsKey = useMemo(() => {
    if (!session || !selectedProjectId) return null;
    return ['projects:cohorts', selectedProjectId, session.token] as const;
  }, [session, selectedProjectId]);

  const { data: cohorts, isLoading: loadingCohorts } = useSWR<CohortRecord[]>(
    cohortsKey,
    ([, projectId, token]) => listProjectCohorts(projectId, token),
  );

  useEffect(() => {
    if (!cohorts || cohorts.length === 0) {
      setSelectedCohortId('');
      return;
    }
    setSelectedCohortId((current) => (cohorts.some((cohort) => cohort.id === current) ? current : cohorts[0].id));
  }, [cohorts]);

  const beneficiariesKey = useMemo(() => {
    if (!session) return null;
    return ['beneficiaries:list', beneficiarySearch, session.token] as const;
  }, [session, beneficiarySearch]);

  const { data: beneficiariesResponse, isLoading: loadingBeneficiaries } = useSWR<
    { data: BeneficiarySummary[]; meta: PaginationMeta }
  >(
    beneficiariesKey,
    ([, searchTerm, token]) => listBeneficiaries({ search: searchTerm, limit: 50 }, token),
  );

  const beneficiaries = beneficiariesResponse?.data ?? [];

  const enrollmentsKey = useMemo(() => {
    if (!session) return null;
    return [
      'enrollments:list',
      selectedProjectId || null,
      selectedCohortId || null,
      enrollmentOffset,
      session.token,
    ] as const;
  }, [session, selectedProjectId, selectedCohortId, enrollmentOffset]);

  const {
    data: enrollmentResponse,
    isLoading: loadingEnrollments,
    mutate: mutateEnrollments,
  } = useSWR<EnrollmentListResponse | undefined>(enrollmentsKey, ([, projectId, cohortId, offset, token]) =>
    listEnrollments(
      {
        projectId: projectId ?? undefined,
        cohortId: cohortId ?? undefined,
        limit: ENROLLMENT_PAGE_SIZE,
        offset,
      },
      token,
    ),
  );

  const enrollments = enrollmentResponse?.data ?? [];
  const enrollmentMeta = enrollmentResponse?.meta ?? {
    limit: ENROLLMENT_PAGE_SIZE,
    offset: enrollmentOffset,
    count: enrollments.length,
  };

  useEffect(() => {
    if (feedback) {
      const timeout = setTimeout(() => setFeedback(null), 4000);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [feedback]);

  useEffect(() => {
    setEnrollmentOffset(0);
  }, [selectedProjectId, selectedCohortId]);

  const project = projects?.find((item) => item.id === selectedProjectId) ?? projects?.[0];
  const availableCohorts = cohorts ?? [];

  if (session === undefined) {
    return null;
  }

  const handleCreateEnrollment = async () => {
    if (!session) return;
    if (!selectedProjectId || !selectedCohortId || !selectedBeneficiaryId) {
      setFeedback({ type: 'error', message: 'Selecione beneficiária, projeto e turma válidos.' });
      return;
    }

    setIsCreating(true);
    try {
      await createEnrollment(
        { beneficiaryId: selectedBeneficiaryId, cohortId: selectedCohortId, enrolledAt: startDate },
        session.token,
      );
      setEnrollmentOffset(0);
      setSelectedBeneficiaryId('');
      setFeedback({ type: 'success', message: 'Inscrição registrada com sucesso.' });
    } catch (error) {
      console.error(error);
      setFeedback({ type: 'error', message: 'Não foi possível registrar a inscrição. Tente novamente.' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleChangePage = (offset: number) => {
    setEnrollmentOffset(offset);
  };

  return (
    <Shell
      title="Inscrições em projetos"
      description="Gerencie inscrições, turmas e lista de espera das beneficiárias de forma centralizada."
      sidebar={session ? <PrimarySidebar session={session} /> : null}
    >
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Card className="space-y-6" padding="lg">
          <header className="space-y-1">
            <p className="text-xs uppercase tracking-[0.28em] text-white/50">Nova inscrição</p>
            <h2 className="text-2xl font-semibold text-white">Configure projeto, turma e data de início</h2>
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
                  setSelectedCohortId('');
                }}
                className="w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/80 focus:border-emerald-400 focus:outline-none"
                disabled={loadingProjects}
              >
                {loadingProjects && <option value="">Carregando projetos...</option>}
                {!loadingProjects && (!projects || projects.length === 0) && <option value="">Nenhum projeto cadastrado</option>}
                {projects?.map((item) => (
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
                value={selectedCohortId}
                onChange={(event) => setSelectedCohortId(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/80 focus:border-emerald-400 focus:outline-none"
                disabled={loadingCohorts || availableCohorts.length === 0}
              >
                {loadingCohorts && <option value="">Carregando turmas...</option>}
                {!loadingCohorts && availableCohorts.length === 0 && <option value="">Nenhuma turma disponível</option>}
                {availableCohorts.map((cohort) => (
                  <option key={cohort.id} value={cohort.id}>
                    {formatCohortLabel(cohort)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="beneficiary" className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
                Beneficiária
              </label>
              <Input
                value={beneficiarySearch}
                onChange={(event) => setBeneficiarySearch(event.target.value)}
                placeholder="Buscar por nome"
                className="text-sm"
              />
              <select
                id="beneficiary"
                value={selectedBeneficiaryId}
                onChange={(event) => setSelectedBeneficiaryId(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/80 focus:border-emerald-400 focus:outline-none"
                disabled={loadingBeneficiaries}
              >
                <option value="">Selecione uma beneficiária</option>
                {beneficiaries.map((beneficiary) => (
                  <option key={beneficiary.id} value={beneficiary.id}>
                    {beneficiary.fullName}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="startDate" className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
                Data de início
              </label>
              <input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/80 focus:border-emerald-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={handleCreateEnrollment} disabled={isCreating}>
              {isCreating ? 'Registrando...' : 'Registrar inscrição'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => mutateEnrollments()}
              disabled={loadingEnrollments}
            >
              Atualizar lista
            </Button>
          </div>
        </Card>

        <ProjectOverviewCard project={project} cohorts={availableCohorts} isLoading={loadingCohorts} />
      </div>

      <EnrollmentTable
        enrollments={enrollments}
        meta={enrollmentMeta}
        isLoading={loadingEnrollments}
        onPageChange={handleChangePage}
      />
    </Shell>
  );
}

interface ProjectOverviewCardProps {
  project?: ProjectRecord;
  cohorts: CohortRecord[];
  isLoading: boolean;
}

function ProjectOverviewCard({ project, cohorts, isLoading }: ProjectOverviewCardProps) {
  if (!project) {
    return null;
  }

  return (
    <Card className="space-y-4" padding="lg">
      <header>
        <p className="text-xs uppercase tracking-[0.28em] text-white/50">Informações do projeto</p>
        <h3 className="mt-1 text-xl font-semibold text-white">{project.name}</h3>
        {project.description && <p className="mt-2 text-xs text-white/70">{project.description}</p>}
      </header>

      <dl className="grid grid-cols-2 gap-4 text-sm text-white/80">
        <div>
          <dt className="text-xs uppercase tracking-[0.24em] text-white/40">Status</dt>
          <dd className="text-lg text-white">{project.active === false ? 'Inativo' : 'Ativo'}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.24em] text-white/40">Slug</dt>
          <dd>{project.slug ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.24em] text-white/40">Criado em</dt>
          <dd>{formatDate(project.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.24em] text-white/40">Atualizado em</dt>
          <dd>{formatDate(project.updatedAt)}</dd>
        </div>
      </dl>

      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-[0.24em] text-white/50">Turmas disponíveis</h4>
        {isLoading && <p className="text-xs text-white/60">Carregando turmas...</p>}
        {!isLoading && cohorts.length === 0 && <p className="text-xs text-white/60">Nenhuma turma cadastrada.</p>}
        <ul className="space-y-2 text-xs text-white/70">
          {cohorts.map((cohort) => (
            <li key={cohort.id} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
              <p className="font-medium text-white">{formatCohortLabel(cohort)}</p>
              <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
                {formatWeekday(cohort.weekday)}
                {cohort.schedule ? ` • ${cohort.schedule}` : ''}
              </p>
              {cohort.location && <p className="text-[11px] text-white/50">Local: {cohort.location}</p>}
              {cohort.educators && cohort.educators.length > 0 && (
                <p className="text-[11px] text-white/50">
                  Educadoras: {cohort.educators.map((item) => item.name ?? 'Equipe IMM').join(', ')}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </Card>
  );
}

interface EnrollmentTableProps {
  enrollments: EnrollmentRecord[];
  meta: PaginationMeta;
  isLoading: boolean;
  onPageChange: (offset: number) => void;
}

function EnrollmentTable({ enrollments, meta, isLoading, onPageChange }: EnrollmentTableProps) {
  if (isLoading) {
    return (
      <Card className="space-y-3" padding="lg">
        <h3 className="text-lg font-semibold text-white">Inscrições recentes</h3>
        <p className="text-sm text-white/70">Carregando registros de inscrições...</p>
      </Card>
    );
  }

  if (enrollments.length === 0) {
    return (
      <Card className="space-y-3" padding="lg">
        <h3 className="text-lg font-semibold text-white">Nenhuma inscrição encontrada</h3>
        <p className="text-sm text-white/70">
          Utilize o formulário acima para registrar novas inscrições ou ajuste os filtros selecionados.
        </p>
      </Card>
    );
  }

  const canPrevious = meta.offset > 0;
  const canNext = meta.offset + meta.limit < meta.count;

  return (
    <Card className="overflow-hidden" padding="lg">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-white/50">Histórico</p>
          <h3 className="text-xl font-semibold text-white">Inscrições registradas</h3>
          <p className="text-xs text-white/60">
            Mostrando {Math.min(meta.offset + meta.limit, meta.count)} de {meta.count} registros
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!canPrevious}
            onClick={() => onPageChange(Math.max(0, meta.offset - meta.limit))}
          >
            Página anterior
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!canNext}
            onClick={() => onPageChange(meta.offset + meta.limit)}
          >
            Próxima página
          </Button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full divide-y divide-white/10 text-sm text-white/80">
          <thead className="text-xs uppercase tracking-[0.22em] text-white/40">
            <tr>
              <th className="px-4 py-3 text-left">Beneficiária</th>
              <th className="px-4 py-3 text-left">Projeto</th>
              <th className="px-4 py-3 text-left">Turma</th>
              <th className="px-4 py-3 text-left">Início</th>
              <th className="px-4 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {enrollments.map((enrollment) => (
              <tr key={enrollment.id} className="bg-white/0">
                <td className="px-4 py-3 text-white">
                  <div className="font-medium">{enrollment.beneficiaryName ?? enrollment.beneficiaryId}</div>
                  <div className="text-xs text-white/50">ID: {enrollment.beneficiaryId}</div>
                </td>
                <td className="px-4 py-3">{enrollment.projectName ?? '—'}</td>
                <td className="px-4 py-3">
                  {enrollment.cohortCode ? `Turma ${enrollment.cohortCode}` : enrollment.cohortId}
                </td>
                <td className="px-4 py-3">{formatDate(enrollment.enrolledAt ?? enrollment.startDate)}</td>
                <td className="px-4 py-3">
                  <StatusPill status={enrollment.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function StatusPill({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const config = ENROLLMENT_STATUS_LABELS[normalized] ?? {
    label: status,
    className: 'bg-white/10 text-white/70 border-white/20',
  };

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${config.className}`}>
      {config.label}
    </span>
  );
}

type EnrollmentListResponse = { data: EnrollmentRecord[]; meta: PaginationMeta };

function formatDate(value?: string | null) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('pt-BR');
  } catch (error) {
    console.error(error);
    return value;
  }
}

function formatWeekday(value?: number | null) {
  if (value === null || value === undefined) {
    return '—';
  }
  const labels = [
    'Domingo',
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado',
  ];
  const index = value >= 1 && value <= 7 ? value - 1 : value;
  return labels[index] ?? '—';
}

function formatCohortLabel(cohort: CohortRecord) {
  const labelParts: string[] = [];
  if (cohort.code) {
    labelParts.push(`Turma ${cohort.code}`);
  }
  if (cohort.shift) {
    labelParts.push(cohort.shift);
  }
  if (cohort.startTime && cohort.endTime) {
    labelParts.push(`${cohort.startTime} - ${cohort.endTime}`);
  }
  if (labelParts.length === 0) {
    labelParts.push('Turma');
  }
  return labelParts.join(' • ');
}
