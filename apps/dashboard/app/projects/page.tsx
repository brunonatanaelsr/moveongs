'use client';

<<<<<<< HEAD
import { useMemo, useState } from 'react';
=======
import { useEffect, useMemo, useState } from 'react';
>>>>>>> origin/codex/refactor-dashboard-app-to-use-hooks
import clsx from 'clsx';
import { Shell } from '../../components/Shell';
import { PrimarySidebar } from '../../components/PrimarySidebar';
import { useRequirePermission } from '../../hooks/useRequirePermission';
import { useProjects } from '../../hooks/useProjects';
<<<<<<< HEAD
import { useCohorts } from '../../hooks/useCohorts';
import { useEnrollments } from '../../hooks/useEnrollments';
=======
import {
  useAttendance,
  useEnrollments,
  type AttendanceMap,
  type EnrollmentSummary,
} from '../../hooks/useEnrollments';
import { FORM_SCHEMAS } from '../../data/formSchemas';
import { FormRenderer } from '../../components/FormRenderer';
import { Button } from '../../components/ui/button';
>>>>>>> origin/codex/refactor-dashboard-app-to-use-hooks
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { LoadingState } from '../../components/LoadingState';
<<<<<<< HEAD
import type { Project } from '../../types/projects';
import type { Cohort } from '../../types/cohorts';
import type { Enrollment } from '../../types/enrollments';

export default function ProjectsPage() {
  const session = useRequirePermission(['projects:read', 'projects:manage']);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedCohortId, setSelectedCohortId] = useState<string | null>(null);
  const [attendanceDate, setAttendanceDate] = useState(() => new Date().toISOString().slice(0, 10));
=======
import { postJson } from '../../lib/api';
import type { AttendanceRecord, FormSubmission, ProjectSummary } from '../../types/operations';

const enrollmentSchema = FORM_SCHEMAS.find((schema) => schema.id === 'form.inscricao_projeto');

type AttendanceDraft = {
  status: AttendanceRecord['status'];
  justification: string;
};

function formatDate(dateIso: string) {
  return new Date(dateIso).toLocaleDateString('pt-BR');
}

function computeAttendanceRate(records: AttendanceRecord[]) {
  if (records.length === 0) return 1;
  const presentes = records.filter((record) => record.status === 'presente').length;
  return presentes / records.length;
}

export default function ProjectsPage() {
  const session = useRequirePermission(['projects:read', 'projects:manage']);
  const { projects, isLoading: loadingProjects } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedClassroomId, setSelectedClassroomId] = useState<string>('');
  const [attendanceDate, setAttendanceDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [attendanceDraft, setAttendanceDraft] = useState<Record<string, AttendanceDraft>>({});
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
>>>>>>> origin/codex/refactor-dashboard-app-to-use-hooks
  const [feedback, setFeedback] = useState<string | null>(null);
  const [updatingEnrollmentId, setUpdatingEnrollmentId] = useState<string | null>(null);
  const [recordingAttendanceId, setRecordingAttendanceId] = useState<string | null>(null);

<<<<<<< HEAD
  const { data: projects, error: projectsError, isLoading: loadingProjects } = useProjects();
  const activeProjectId = selectedProjectId ?? projects?.[0]?.id ?? null;
=======
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId),
    [projects, selectedProjectId],
  );

  useEffect(() => {
    if (!selectedProject) return;
    const defaultCohort = selectedProject.cohorts[0]?.id ?? '';
    setSelectedClassroomId((current) =>
      current && selectedProject.cohorts.some((cohort) => cohort.id === current) ? current : defaultCohort,
    );
  }, [selectedProject]);

  useEffect(() => {
    setAttendanceDraft({});
  }, [selectedClassroomId]);

  const { enrollments, mutateEnrollments } = useEnrollments(selectedProjectId || undefined);
  const projectEnrollments = useMemo(
    () => enrollments.filter((enrollment) => enrollment.projectId === selectedProjectId),
    [enrollments, selectedProjectId],
  );
  const classroomEnrollments = useMemo(
    () =>
      projectEnrollments.filter((enrollment) =>
        selectedClassroomId ? enrollment.cohortId === selectedClassroomId : true,
      ),
    [projectEnrollments, selectedClassroomId],
  );
  const enrollmentIds = useMemo(() => projectEnrollments.map((enrollment) => enrollment.id), [projectEnrollments]);
  const { attendanceByEnrollment, mutateAttendance } = useAttendance(enrollmentIds);

  const enrollmentSuccessRate = useMemo(() => {
    if (!selectedProject || selectedProject.capacity === 0) return 0;
    const active = projectEnrollments.filter((enrollment) => enrollment.status === 'ativa').length;
    return active / selectedProject.capacity;
  }, [projectEnrollments, selectedProject]);

  const availableClassrooms = selectedProject?.cohorts ?? [];

  const beneficiariesWithoutEnrollment: string[] = [];

  const notify = (message: string) => {
    setFeedback(message);
    window.setTimeout(() => setFeedback(null), 4000);
  };

  if (session === undefined || loadingProjects) {
    return <LoadingState message="Carregando dados do projeto..." />;
  }

  if (!session) {
    return <LoadingState message="Carregando..." />;
  }

  const handleEnrollmentSubmit = (data: Record<string, unknown>) => {
    if (!session || !selectedProject) {
      notify('Sessão inválida ou projeto não selecionado.');
      return;
    }

    const cohortId = selectedClassroomId || selectedProject.cohorts[0]?.id || '';
    if (!cohortId) {
      notify('Selecione uma turma para registrar a matrícula.');
      return;
    }

    const beneficiaryName = String(data.nome ?? '').trim() || 'Beneficiária';
    const beneficiaryId =
      String(data.codigo_matricula ?? '').trim() || `beneficiary-${Math.random().toString(36).slice(2, 8)}`;

    const optimisticEnrollment: EnrollmentSummary = {
      id: `enrollment-${Math.random().toString(36).slice(2, 10)}`,
      projectId: selectedProject.id,
      cohortId,
      startDate: new Date().toISOString(),
      status: 'pendente',
      agreementsAccepted: Boolean(data.acordos),
      beneficiary: {
        id: beneficiaryId,
        name: beneficiaryName,
      },
    };

    const snapshot = [...enrollments];
    mutateEnrollments({ data: [...snapshot, optimisticEnrollment] }, false);

    if (enrollmentSchema) {
      setSubmissions((prev) => [
        ...prev,
        {
          id: `submission-${Math.random().toString(36).slice(2, 8)}`,
          schemaId: enrollmentSchema.id,
          schemaVersion: enrollmentSchema.version,
          submittedAt: new Date().toISOString(),
          submittedBy: session.user.name,
          status: 'enviado',
          payload: data,
        },
      ]);
    }

    void (async () => {
      try {
        await postJson(
          '/enrollments',
          {
            projectId: selectedProject.id,
            cohortId,
            beneficiary: {
              id: beneficiaryId,
              name: beneficiaryName,
              birthDate: data.data_nascimento,
              contact: data.contato,
            },
            agreementsAccepted: Boolean(data.acordos),
            schedule: {
              turno: data.turno,
              horario: data.horario,
            },
          },
          session.token,
        );
        await mutateEnrollments();
        notify('Matrícula registrada com sucesso e sincronizada com a API.');
      } catch (error) {
        await mutateEnrollments({ data: snapshot }, false);
        notify('Não foi possível registrar a matrícula. Tente novamente.');
      }
    })();
  };

  const handleAttendanceDraftChange = (
    enrollmentId: string,
    partial: Partial<AttendanceDraft>,
  ) => {
    setAttendanceDraft((prev) => {
      const current = prev[enrollmentId] ?? { status: 'presente', justification: '' };
      return {
        ...prev,
        [enrollmentId]: {
          status: partial.status ?? current.status,
          justification: partial.justification ?? current.justification,
        },
      };
    });
  };

  const handleAttendanceSubmit = async () => {
    if (!session) {
      notify('Sessão inválida.');
      return;
    }

    if (classroomEnrollments.length === 0) {
      notify('Nenhuma matrícula nesta turma para registrar presença.');
      return;
    }

    const snapshot: AttendanceMap = Object.fromEntries(
      Object.entries(attendanceByEnrollment).map(([id, records]) => [id, [...records]]),
    );

    const updates = classroomEnrollments.map((enrollment) => {
      const draft = attendanceDraft[enrollment.id] ?? { status: 'presente', justification: '' };
      const record: AttendanceRecord = {
        id: `attendance-${Math.random().toString(36).slice(2, 10)}`,
        date: attendanceDate,
        status: draft.status,
        justification: draft.justification.trim() ? draft.justification.trim() : undefined,
        recordedBy: session.user.name,
      };
      return { enrollmentId: enrollment.id, record };
    });

    const optimistic: AttendanceMap = { ...snapshot };
    updates.forEach(({ enrollmentId, record }) => {
      const list = optimistic[enrollmentId] ? [...optimistic[enrollmentId]] : [];
      list.push(record);
      optimistic[enrollmentId] = list;
    });

    await mutateAttendance(optimistic, false);

    try {
      await Promise.all(
        updates.map(({ enrollmentId, record }) =>
          postJson(
            `/enrollments/${enrollmentId}/attendance`,
            { date: record.date, status: record.status, justification: record.justification },
            session.token,
          ),
        ),
      );
      await mutateAttendance();
      setAttendanceDraft({});
      notify('Presenças registradas com sucesso.');
    } catch (error) {
      await mutateAttendance(snapshot, false);
      notify('Não foi possível salvar as presenças. Verifique sua conexão e tente novamente.');
    }
  };

  const primarySidebar = useMemo(() => (session ? <PrimarySidebar session={session} /> : null), [session]);

  return (
    <Shell
      title="Gestão de projetos e presenças"
      description="Acompanhe capacidades, matrículas, assiduidade e formulários operacionais dos projetos do IMM."
      sidebar={primarySidebar}
    >
      {feedback && (
        <div className="rounded-3xl border border-emerald-300/40 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          {feedback}
        </div>
      )}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <ProjectHighlights
          projects={projects}
          selectedProject={selectedProject}
          onSelect={setSelectedProjectId}
          enrollmentRate={enrollmentSuccessRate}
          enrollments={projectEnrollments.length}
        />

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glass shadow-black/10">
          <h3 className="text-lg font-semibold text-white">Últimos formulários de inscrição</h3>
          <p className="mt-1 text-sm text-white/70">Histórico das matrículas registradas pela equipe técnica.</p>
          <ul className="mt-4 space-y-3">
            {submissions
              .filter((submission) => submission.schemaId === enrollmentSchema?.id)
              .slice(-5)
              .reverse()
              .map((submission) => (
                <li
                  key={submission.id}
                  className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-white/70"
                >
                  <p className="font-semibold text-white">{formatDate(submission.submittedAt)}</p>
                  <p className="mt-1">{submission.submittedBy}</p>
                  <p className="mt-1 text-white/60">
                    Campos preenchidos: {Object.keys(submission.payload).length}
                  </p>
                </li>
              ))}
          </ul>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glass shadow-black/10">
          <header className="space-y-1">
            <h3 className="text-xl font-semibold text-white">Matrículas e acordos</h3>
            <p className="text-sm text-white/70">
              Preencha o formulário oficial de inscrição para confirmar participação nas turmas selecionadas e registrar acordos
              de convivência.
            </p>
          </header>
          {enrollmentSchema ? (
            <FormRenderer schema={enrollmentSchema} onSubmit={handleEnrollmentSubmit} submitLabel="Registrar matrícula" />
          ) : (
            <p className="text-sm text-white/60">Schema de inscrição não encontrado.</p>
          )}
        </div>

        <div className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glass shadow-black/10">
          <header className="space-y-1">
            <h3 className="text-xl font-semibold text-white">Controle de frequência</h3>
            <p className="text-sm text-white/70">
              Registre presenças, ausências justificadas e acompanhe a assiduidade média de cada beneficiária na turma.
            </p>
          </header>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-slate-200">
              Turma
              <select
                value={selectedClassroomId}
                onChange={(event) => setSelectedClassroomId(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-900/60 p-3 text-sm text-white focus:border-cyan-300 focus:outline-none"
              >
                {availableClassrooms.map((cohort) => (
                  <option key={cohort.id} value={cohort.id}>
                    {cohort.name} • {cohort.schedule}
                  </option>
                ))}
              </select>
            </label>
            <Input
              type="date"
              label="Data do encontro"
              value={attendanceDate}
              onChange={(event) => setAttendanceDate(event.target.value)}
            />
          </div>

          <div className="space-y-3">
            {classroomEnrollments.length === 0 && (
              <p className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-4 text-sm text-white/60">
                Nenhuma beneficiária matriculada nesta turma.
              </p>
            )}

            {classroomEnrollments.map((enrollment) => {
              const records = attendanceByEnrollment[enrollment.id] ?? [];
              const rate = computeAttendanceRate(records);
              const draft = attendanceDraft[enrollment.id] ?? { status: 'presente', justification: '' };

              return (
                <div
                  key={enrollment.id}
                  className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="text-base font-semibold text-white">{enrollment.beneficiary.name}</p>
                    <p className="text-xs text-white/60">
                      Início em {formatDate(enrollment.startDate)} · Assiduidade: {(rate * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 md:flex-row md:items-center md:justify-end">
                    <select
                      value={draft.status}
                      onChange={(event) =>
                        handleAttendanceDraftChange(enrollment.id, { status: event.target.value as AttendanceRecord['status'] })
                      }
                      className="w-full rounded-2xl border border-white/10 bg-slate-900/60 p-3 text-sm text-white focus:border-cyan-300 focus:outline-none md:max-w-[180px]"
                    >
                      <option value="presente">Presente</option>
                      <option value="ausente">Ausente</option>
                      <option value="justificado">Justificada</option>
                    </select>
                    <Input
                      label="Justificativa (opcional)"
                      placeholder="Descreva a justificativa"
                      value={draft.justification}
                      onChange={(event) =>
                        handleAttendanceDraftChange(enrollment.id, { justification: event.target.value })
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end">
            <Button onClick={handleAttendanceSubmit}>Salvar frequência</Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <EnrollmentTable
          enrollments={projectEnrollments}
          project={selectedProject}
          attendance={attendanceByEnrollment}
        />
        <BeneficiaryPipeline beneficiaries={beneficiariesWithoutEnrollment} project={selectedProject} />
      </section>
    </Shell>
  );
}

interface ProjectHighlightsProps {
  projects: ProjectSummary[];
  selectedProject?: ProjectSummary;
  onSelect: (projectId: string) => void;
  enrollmentRate: number;
  enrollments: number;
}

function ProjectHighlights({ projects, selectedProject, onSelect, enrollmentRate, enrollments }: ProjectHighlightsProps) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glass shadow-black/10">
      <header className="space-y-1">
        <h3 className="text-xl font-semibold text-white">Projetos ativos</h3>
        <p className="text-sm text-white/70">Selecione um projeto para visualizar turmas, matrículas e capacidade.</p>
      </header>
      <ul className="mt-4 space-y-3">
        {projects.map((project) => {
          const isActive = selectedProject?.id === project.id;
          return (
            <li key={project.id}>
              <button
                type="button"
                onClick={() => onSelect(project.id)}
                className={clsx(
                  'w-full rounded-3xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-white/30 hover:bg-white/10',
                  isActive && 'border-cyan-300/60 bg-cyan-500/10 shadow-glass',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-white">{project.name}</p>
                    <p className="text-xs uppercase tracking-[0.2em] text-white/50">{project.focus}</p>
                  </div>
                  <span className="text-xs text-white/60">{project.capacity} vagas</span>
                </div>
                <p className="mt-3 text-sm text-white/70">{project.description}</p>
                <div className="mt-4 grid gap-2 text-xs text-white/60 md:grid-cols-3">
                  <p>
                    Matrículas ativas:
                    <span className="ml-1 font-semibold text-white">{project.activeEnrollments}</span>
                  </p>
                  <p>
                    Alertas de risco:
                    <span className="ml-1 font-semibold text-amber-200">{project.riskAlerts}</span>
                  </p>
                  <p>
                    Assiduidade média:
                    <span className="ml-1 font-semibold text-emerald-200">{(project.attendanceRate * 100).toFixed(0)}%</span>
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      {selectedProject && (
        <div className="mt-6 rounded-2xl border border-cyan-300/40 bg-cyan-500/10 p-4 text-sm text-cyan-100">
          <p className="font-semibold text-white">{selectedProject.name}</p>
          <p className="mt-1 text-xs text-white/80">
            {enrollments} matrículas acompanhadas · {selectedProject.cohorts.length} turmas em operação
          </p>
          <p className="mt-2 text-xs text-white/70">
            Taxa de preenchimento da capacidade: {(enrollmentRate * 100).toFixed(1)}%
          </p>
        </div>
      )}
    </div>
  );
}

interface EnrollmentTableProps {
  enrollments: EnrollmentSummary[];
  project?: ProjectSummary;
  attendance: AttendanceMap;
}

function EnrollmentTable({ enrollments, project, attendance }: EnrollmentTableProps) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glass shadow-black/10">
      <header className="space-y-1">
        <h3 className="text-xl font-semibold text-white">Matrículas por turma</h3>
        <p className="text-sm text-white/70">
          Acompanhe o status das beneficiárias nas turmas do projeto selecionado e identifique quedas de assiduidade.
        </p>
      </header>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm text-white/80">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-white/60">
              <th className="pb-2 pr-4">Beneficiária</th>
              <th className="pb-2 pr-4">Turma</th>
              <th className="pb-2 pr-4">Início</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2 pr-4">Assiduidade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {enrollments.map((enrollment) => {
              const cohort = project?.cohorts.find((item) => item.id === enrollment.cohortId);
              const records = attendance[enrollment.id] ?? [];
              const percent = Math.round(computeAttendanceRate(records) * 100);

              return (
                <tr key={enrollment.id}>
                  <td className="py-2 pr-4 text-white">{enrollment.beneficiary.name}</td>
                  <td className="py-2 pr-4">{cohort ? cohort.name : enrollment.cohortId}</td>
                  <td className="py-2 pr-4">{formatDate(enrollment.startDate)}</td>
                  <td className="py-2 pr-4 capitalize">{enrollment.status}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={clsx(
                        'rounded-xl px-3 py-1 text-xs font-semibold',
                        percent >= 75 ? 'bg-emerald-500/20 text-emerald-100' : 'bg-rose-500/20 text-rose-100',
                      )}
                    >
                      {percent}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface BeneficiaryPipelineProps {
  beneficiaries: string[];
  project?: ProjectSummary;
}

function BeneficiaryPipeline({ beneficiaries, project }: BeneficiaryPipelineProps) {
  return (
    <div className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glass shadow-black/10">
      <header className="space-y-1">
        <h3 className="text-xl font-semibold text-white">Fila de espera e triagem</h3>
        <p className="text-sm text-white/70">
          Beneficiárias com perfil aderente que ainda não iniciaram o processo de matrícula no projeto selecionado.
        </p>
      </header>
      <ul className="space-y-3">
        {beneficiaries.length === 0 && (
          <li className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-4 text-sm text-white/60">
            Lista de espera disponível após integração com o CRM de triagem.
          </li>
        )}
        {beneficiaries.map((beneficiary) => (
          <li
            key={beneficiary}
            className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80"
          >
            <div>
              <p className="font-semibold text-white">{beneficiary}</p>
              <p className="text-xs text-white/60">Triagem concluída · Documentação validada</p>
            </div>
            <Button variant="secondary" size="sm">
              Agendar matrícula
            </Button>
          </li>
        ))}
      </ul>
      {project && (
        <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-xs text-white/70">
          <p className="font-semibold text-white">Próximos passos recomendados</p>
          <ul className="mt-2 space-y-1 list-disc pl-4">
            <li>Confirmar disponibilidade de vagas na turma {project.cohorts[0]?.name ?? ''}.</li>
            <li>Verificar consentimentos LGPD antes do início das atividades.</li>
            <li>Enviar comunicado de boas-vindas via mensagens internas.</li>
          </ul>
        </div>
      )}
    </div>
  );
}
>>>>>>> origin/codex/refactor-dashboard-app-to-use-hooks
