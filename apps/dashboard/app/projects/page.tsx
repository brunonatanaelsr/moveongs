'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Shell } from '../../components/Shell';
import { PrimarySidebar } from '../../components/PrimarySidebar';
import { useRequirePermission } from '../../hooks/useRequirePermission';
import { BENEFICIARIES, PROJECTS, INITIAL_FORM_SUBMISSIONS, ALL_FORM_SCHEMAS } from '../../data/mockOperations';
import type { FormSubmission } from '../../data/mockOperations';
import type { AttendanceRecord, ProjectSummary } from '../../types/operations';
import { FormRenderer } from '../../components/FormRenderer';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { LoadingState } from '../../components/LoadingState';

interface EnrollmentListItem {
  id: string;
  projectId: string;
  classroomId: string;
  beneficiaryId: string;
  beneficiaryName: string;
  status: string;
  startDate: string;
}

interface AttendanceEntry extends AttendanceRecord {
  beneficiaryId: string;
  beneficiaryName: string;
  classroomId: string;
}

const enrollmentSchema = ALL_FORM_SCHEMAS.find((schema) => schema.id === 'form.inscricao_projeto');

function getInitialEnrollments(): EnrollmentListItem[] {
  return BENEFICIARIES.flatMap((beneficiary) =>
    beneficiary.enrollments.map((enrollment) => ({
      id: enrollment.id,
      projectId: enrollment.projectId,
      classroomId: enrollment.classroomId,
      beneficiaryId: beneficiary.id,
      beneficiaryName: beneficiary.name,
      status: enrollment.status,
      startDate: enrollment.startDate,
    })),
  );
}

function getInitialAttendance(): AttendanceEntry[] {
  return BENEFICIARIES.flatMap((beneficiary) =>
    Object.entries(beneficiary.attendance).flatMap(([classroomId, records]) =>
      records.map((record) => ({
        ...record,
        beneficiaryId: beneficiary.id,
        beneficiaryName: beneficiary.name,
        classroomId,
      })),
    ),
  );
}

function formatDate(dateIso: string) {
  return new Date(dateIso).toLocaleDateString('pt-BR');
}

function computeAttendanceRate(records: AttendanceEntry[], classroomId: string, beneficiaryId: string) {
  const scoped = records.filter((record) => record.classroomId === classroomId && record.beneficiaryId === beneficiaryId);
  if (scoped.length === 0) return 1;
  const presentes = scoped.filter((record) => record.status === 'presente').length;
  return presentes / scoped.length;
}

export default function ProjectsPage() {
  const session = useRequirePermission(['projects:read', 'projects:manage']);
  const [enrollments, setEnrollments] = useState<EnrollmentListItem[]>(() => getInitialEnrollments());
  const [attendance, setAttendance] = useState<AttendanceEntry[]>(() => getInitialAttendance());
  const [submissions, setSubmissions] = useState<FormSubmission[]>(INITIAL_FORM_SUBMISSIONS);
  const [selectedProjectId, setSelectedProjectId] = useState(PROJECTS[0]?.id ?? '');
  const [selectedClassroomId, setSelectedClassroomId] = useState(PROJECTS[0]?.cohorts[0]?.id ?? '');
  const [attendanceDate, setAttendanceDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (session === undefined) {
    return <LoadingState message="Verificando sessão..." />;
  }

  if (!session) {
    return <LoadingState message="Carregando..." />;
  }

  const selectedProject = PROJECTS.find((project) => project.id === selectedProjectId) ?? PROJECTS[0];

  const projectEnrollments = enrollments.filter((enrollment) => enrollment.projectId === selectedProject?.id);

  const classroomEnrollments = projectEnrollments.filter((enrollment) =>
    selectedClassroomId ? enrollment.classroomId === selectedClassroomId : true,
  );

  const beneficiariesWithoutEnrollment = BENEFICIARIES.filter(
    (beneficiary) => !projectEnrollments.some((enrollment) => enrollment.beneficiaryId === beneficiary.id),
  );

  const availableClassrooms = selectedProject?.cohorts ?? [];

  const enrollmentSuccessRate = selectedProject
    ? projectEnrollments.filter((enrollment) => enrollment.status === 'ativa').length / selectedProject.capacity
    : 0;

  const handleEnrollmentSubmit = (data: Record<string, unknown>) => {
    const beneficiaryName = String(data.nome ?? 'Beneficiária');
    const beneficiary = BENEFICIARIES.find((item) => item.name === beneficiaryName);
    const classroomLabel = String(data.turma ?? '');
    const classroom = selectedProject?.cohorts.find((item) => classroomLabel.includes(item.name));

    const enrollment: EnrollmentListItem = {
      id: `enrollment-${Math.random().toString(36).slice(2, 8)}`,
      projectId: selectedProject?.id ?? 'project-costura',
      classroomId: classroom?.id ?? selectedProject?.cohorts[0]?.id ?? 'classroom-temp',
      beneficiaryId: beneficiary?.id ?? `beneficiary-temp-${Date.now()}`,
      beneficiaryName,
      status: 'ativa',
      startDate: new Date().toISOString(),
    };

    setEnrollments((prev) => [...prev, enrollment]);
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
    setFeedback('Matrícula registrada com sucesso e formulário armazenado.');
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleAttendanceSubmit = () => {
    classroomEnrollments.forEach((enrollment) => {
      const element = document.getElementById(`attendance-${enrollment.beneficiaryId}`) as HTMLSelectElement | null;
      if (!element) return;
      const status = element.value as AttendanceRecord['status'];
      const justificationInput = document.getElementById(
        `attendance-justification-${enrollment.beneficiaryId}`,
      ) as HTMLInputElement | null;
      const justification = justificationInput?.value ? justificationInput.value : undefined;

      const newEntry: AttendanceEntry = {
        id: `att-${Math.random().toString(36).slice(2, 8)}`,
        beneficiaryId: enrollment.beneficiaryId,
        beneficiaryName: enrollment.beneficiaryName,
        classroomId: enrollment.classroomId,
        date: attendanceDate,
        status,
        justification: justification && justification.length > 0 ? justification : undefined,
        recordedBy: session.user.name,
      };

      setAttendance((prev) => [...prev, newEntry]);
    });
    setFeedback('Presenças registradas e assiduidade recalculada.');
    setTimeout(() => setFeedback(null), 4000);
  };

  return (
    <Shell
      title="Gestão de projetos e presenças"
      description="Acompanhe capacidades, matrículas, assiduidade e formulários operacionais dos projetos do IMM."
      sidebar={<PrimarySidebar session={session} />}
    >
      {feedback && (
        <div className="rounded-3xl border border-emerald-300/40 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          {feedback}
        </div>
      )}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <ProjectHighlights
          projects={PROJECTS}
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
              const rate = computeAttendanceRate(attendance, enrollment.classroomId, enrollment.beneficiaryId);
              return (
                <div
                  key={enrollment.id}
                  className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="text-base font-semibold text-white">{enrollment.beneficiaryName}</p>
                    <p className="text-xs text-white/60">
                      Início em {formatDate(enrollment.startDate)} · Assiduidade: {(rate * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 md:flex-row md:items-center md:justify-end">
                    <select
                      id={`attendance-${enrollment.beneficiaryId}`}
                      className="w-full rounded-2xl border border-white/10 bg-slate-900/60 p-3 text-sm text-white focus:border-cyan-300 focus:outline-none md:max-w-[180px]"
                      defaultValue="presente"
                    >
                      <option value="presente">Presente</option>
                      <option value="ausente">Ausente</option>
                      <option value="justificado">Justificada</option>
                    </select>
                    <Input
                      id={`attendance-justification-${enrollment.beneficiaryId}`}
                      label="Justificativa (opcional)"
                      placeholder="Descreva a justificativa"
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
        <EnrollmentTable enrollments={projectEnrollments} project={selectedProject} attendance={attendance} />
        <BeneficiaryPipeline
          beneficiaries={beneficiariesWithoutEnrollment.map((beneficiary) => beneficiary.name)}
          project={selectedProject}
        />
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
  enrollments: EnrollmentListItem[];
  project?: ProjectSummary;
  attendance: AttendanceEntry[];
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
              const cohort = project?.cohorts.find((item) => item.id === enrollment.classroomId);
              const records = attendance.filter(
                (record) => record.beneficiaryId === enrollment.beneficiaryId && record.classroomId === enrollment.classroomId,
              );
              const attended = records.filter((record) => record.status === 'presente').length;
              const percent = records.length > 0 ? Math.round((attended / records.length) * 100) : 100;
              return (
                <tr key={enrollment.id}>
                  <td className="py-2 pr-4 text-white">{enrollment.beneficiaryName}</td>
                  <td className="py-2 pr-4">{cohort ? cohort.name : enrollment.classroomId}</td>
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
            Todas as beneficiárias ativas já estão matriculadas neste projeto.
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
