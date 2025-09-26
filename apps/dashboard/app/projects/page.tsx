'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { Shell } from '../../components/Shell';
import { PrimarySidebar } from '../../components/PrimarySidebar';
import { useRequirePermission } from '../../hooks/useRequirePermission';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { LoadingState } from '../../components/LoadingState';
import {
  listProjects,
  listProjectCohorts,
  listEnrollments,
  updateEnrollment,
  recordAttendance,
  type ProjectRecord,
  type CohortRecord,
  type EnrollmentRecord,
} from '../../lib/operations';

type ProjectsResponse = ProjectRecord[];
type CohortsResponse = CohortRecord[];
type EnrollmentsResponse = { data: EnrollmentRecord[] };

export default function ProjectsPage() {
  const session = useRequirePermission(['projects:read', 'projects:manage']);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedCohortId, setSelectedCohortId] = useState<string | null>(null);
  const [attendanceDate, setAttendanceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [feedback, setFeedback] = useState<string | null>(null);
  const [updatingEnrollmentId, setUpdatingEnrollmentId] = useState<string | null>(null);
  const [recordingAttendanceId, setRecordingAttendanceId] = useState<string | null>(null);

  const projectsKey = useMemo(() => {
    if (!session) return null;
    return ['projects:list', session.token] as const;
  }, [session]);

  const {
    data: projects,
    error: projectsError,
    isLoading: loadingProjects,
  } = useSWR<ProjectsResponse>(projectsKey, ([, token]) => listProjects(token));

  const activeProjectId = selectedProjectId ?? projects?.[0]?.id ?? null;

  const cohortsKey = useMemo(() => {
    if (!session || !activeProjectId) return null;
    return ['projects:cohorts', activeProjectId, session.token] as const;
  }, [session, activeProjectId]);

  const { data: cohorts } = useSWR<CohortsResponse>(cohortsKey, ([, id, token]) => listProjectCohorts(id, token));

  const enrollmentsKey = useMemo(() => {
    if (!session || !activeProjectId) return null;
    return [
      'projects:enrollments',
      activeProjectId,
      selectedCohortId,
      session.token,
    ] as const;
  }, [session, activeProjectId, selectedCohortId]);

  const {
    data: enrollments,
    mutate: mutateEnrollments,
    isLoading: loadingEnrollments,
  } = useSWR<EnrollmentsResponse>(enrollmentsKey, ([, projectId, cohortId, token]) =>
    listEnrollments({ projectId, cohortId: cohortId ?? undefined, limit: 100 }, token),
  );

  if (session === undefined) {
    return <LoadingState message="Verificando sessão..." />;
  }

  if (!session) {
    return <LoadingState message="Carregando..." />;
  }

  const handleUpdateEnrollment = async (enrollmentId: string, status: string) => {
    if (!session) return;

    setUpdatingEnrollmentId(enrollmentId);
    try {
      await updateEnrollment(enrollmentId, { status }, session.token);
      await mutateEnrollments();
      setFeedback('Matrícula atualizada com sucesso.');
    } catch (error) {
      console.error(error);
      setFeedback('Não foi possível atualizar a matrícula.');
    } finally {
      setUpdatingEnrollmentId(null);
    }
  };

  const handleRecordAttendance = async (enrollmentId: string, present: boolean) => {
    if (!session) return;

    setRecordingAttendanceId(enrollmentId);
    try {
      await recordAttendance(enrollmentId, { date: attendanceDate, present }, session.token);
      setFeedback('Frequência registrada.');
    } catch (error) {
      console.error(error);
      setFeedback('Não foi possível registrar a frequência.');
    } finally {
      setRecordingAttendanceId(null);
    }
  };

  return (
    <Shell
      title="Gestão de projetos"
      description="Acompanhe matrículas e registre presenças das turmas."
      sidebar={<PrimarySidebar session={session} />}
    >
      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-glass shadow-black/10">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/80">Projetos</h2>
            {loadingProjects && <p className="mt-3 text-sm text-white/70">Carregando projetos...</p>}
            {projectsError && <p className="mt-3 text-sm text-rose-300">Erro ao carregar projetos.</p>}
            <ul className="mt-3 space-y-2">
              {projects?.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProjectId(project.id);
                      setSelectedCohortId(null);
                    }}
                    className={clsx(
                      'w-full rounded-2xl border px-4 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-emerald-400',
                      project.id === activeProjectId
                        ? 'border-emerald-400/60 bg-emerald-500/10 text-white'
                        : 'border-white/10 bg-white/5 text-white/80 hover:border-white/20 hover:bg-white/10',
                    )}
                  >
                    <span className="block text-sm font-medium">{project.name}</span>
                    {project.description && (
                      <span className="mt-1 block text-xs text-white/60">{project.description}</span>
                    )}
                  </button>
                </li>
              ))}
              {!loadingProjects && !projectsError && projects?.length === 0 && (
                <li className="text-sm text-white/70">Nenhum projeto cadastrado.</li>
              )}
            </ul>
          </div>
        </aside>

        <section className="space-y-4">
          {feedback && (
            <div className="rounded-3xl border border-emerald-300/40 bg-emerald-500/10 p-4 text-sm text-emerald-100">
              {feedback}
            </div>
          )}

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glass shadow-black/10">
            <header className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-white">{projects?.find((p) => p.id === activeProjectId)?.name ?? 'Projeto'}</h2>
                <p className="mt-1 text-sm text-white/70">
                  Gerencie matrículas e presença das turmas vinculadas a este projeto.
                </p>
              </div>
              <div className="space-y-2 text-sm text-white/70">
                <label className="block text-xs uppercase tracking-wide text-white/60">Data de registro</label>
                <Input
                  type="date"
                  value={attendanceDate}
                  onChange={(event) => setAttendanceDate(event.target.value)}
                  className="w-48"
                />
              </div>
            </header>

            <section className="mt-6 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-white/60">Turmas</span>
                <button
                  type="button"
                  className={clsx(
                    'rounded-full px-3 py-1 text-xs transition',
                    selectedCohortId === null
                      ? 'bg-emerald-500 text-white'
                      : 'bg-white/10 text-white/70 hover:bg-white/20',
                  )}
                  onClick={() => setSelectedCohortId(null)}
                >
                  Todas
                </button>
                {cohorts?.map((cohort) => (
                  <button
                    key={cohort.id}
                    type="button"
                    className={clsx(
                      'rounded-full px-3 py-1 text-xs transition',
                      cohort.id === selectedCohortId
                        ? 'bg-emerald-500 text-white'
                        : 'bg-white/10 text-white/70 hover:bg-white/20',
                    )}
                    onClick={() => setSelectedCohortId(cohort.id)}
                  >
                    {cohort.name}
                  </button>
                ))}
              </div>

              {loadingEnrollments ? (
                <p className="text-sm text-white/70">Carregando matrículas...</p>
              ) : enrollments?.data?.length ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-white/10 text-sm text-white/80">
                    <thead>
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold text-white">Beneficiária</th>
                        <th className="px-4 py-2 text-left font-semibold text-white">Turma</th>
                        <th className="px-4 py-2 text-left font-semibold text-white">Status</th>
                        <th className="px-4 py-2 text-left font-semibold text-white">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {enrollments.data.map((enrollment) => (
                        <EnrollmentRow
                          key={enrollment.id}
                          enrollment={enrollment}
                          cohorts={cohorts ?? []}
                          onUpdateStatus={handleUpdateEnrollment}
                          onRecordAttendance={handleRecordAttendance}
                          updating={updatingEnrollmentId === enrollment.id}
                          recording={recordingAttendanceId === enrollment.id}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-white/70">Nenhuma matrícula encontrada para este filtro.</p>
              )}
            </section>
          </div>
        </section>
      </div>
    </Shell>
  );
}

interface EnrollmentRowProps {
  enrollment: EnrollmentRecord;
  cohorts: CohortRecord[];
  updating: boolean;
  recording: boolean;
  onUpdateStatus: (id: string, status: string) => Promise<void>;
  onRecordAttendance: (id: string, present: boolean) => Promise<void>;
}

function EnrollmentRow({
  enrollment,
  cohorts,
  updating,
  recording,
  onUpdateStatus,
  onRecordAttendance,
}: EnrollmentRowProps) {
  const cohort = cohorts.find((item) => item.id === enrollment.cohortId);

  return (
    <tr className="align-top">
      <td className="px-4 py-3">
        <div className="font-medium text-white">{enrollment.beneficiaryId}</div>
        <div className="text-xs text-white/50">Início {enrollment.startDate ? new Date(enrollment.startDate).toLocaleDateString('pt-BR') : '—'}</div>
      </td>
      <td className="px-4 py-3 text-sm text-white/70">{cohort?.name ?? 'Turma'}</td>
      <td className="px-4 py-3 text-sm text-white/70">{enrollment.status}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={updating}
            onClick={() => onUpdateStatus(enrollment.id, enrollment.status === 'ativa' ? 'desligada' : 'ativa')}
          >
            {updating ? 'Atualizando...' : enrollment.status === 'ativa' ? 'Desligar' : 'Reativar'}
          </Button>
          <Button
            size="sm"
            disabled={recording}
            onClick={() => onRecordAttendance(enrollment.id, true)}
          >
            {recording ? 'Registrando...' : 'Presença'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={recording}
            onClick={() => onRecordAttendance(enrollment.id, false)}
          >
            {recording ? 'Registrando...' : 'Falta'}
          </Button>
        </div>
      </td>
    </tr>
  );
}
