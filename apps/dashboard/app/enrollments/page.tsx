'use client';

import { useMemo, useState } from 'react';
import { Shell } from '../../components/Shell';
import { PrimarySidebar } from '../../components/PrimarySidebar';
import { useRequirePermission } from '../../hooks/useRequirePermission';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import {
  demoBeneficiaries,
  demoCohorts,
  demoProjects,
  type DemoBeneficiary,
  type DemoCohort,
  type DemoProject,
} from '../../lib/demo-data';

interface LocalEnrollment {
  id: string;
  beneficiary: DemoBeneficiary;
  project: DemoProject;
  cohort: DemoCohort;
  startDate: string;
  status: 'ativa' | 'aguardando' | 'pendente';
}

export default function EnrollmentsPage() {
  const session = useRequirePermission(['enrollments:create']);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(demoProjects[0]?.id ?? '');
  const [selectedCohortId, setSelectedCohortId] = useState<string>('');
  const [selectedBeneficiaryId, setSelectedBeneficiaryId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [enrollments, setEnrollments] = useState<LocalEnrollment[]>([]);

  const primarySidebar = useMemo(() => (session ? <PrimarySidebar session={session} /> : null), [session]);
  const availableCohorts = demoCohorts.filter((cohort) => cohort.projectId === selectedProjectId);
  const project = demoProjects.find((item) => item.id === selectedProjectId) ?? demoProjects[0];

  if (session === undefined) {
    return null;
  }

  const handleCreateEnrollment = () => {
    const beneficiary = demoBeneficiaries.find((item) => item.id === selectedBeneficiaryId);
    const cohort = availableCohorts.find((item) => item.id === selectedCohortId);
    if (!beneficiary || !cohort || !project) {
      alert('Selecione beneficiária, projeto e turma válidos.');
      return;
    }

    setEnrollments((prev) => [
      {
        id: `enr-${Date.now()}`,
        beneficiary,
        cohort,
        project,
        startDate,
        status: 'pendente',
      },
      ...prev,
    ]);

    setSelectedBeneficiaryId('');
    setSelectedCohortId('');
  };

  return (
    <Shell
      title="Inscrições em projetos"
      description="Gerencie inscrições, turmas e lista de espera das beneficiárias de forma centralizada."
      sidebar={primarySidebar}
    >
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
                  setSelectedCohortId('');
                }}
                className="w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/80 focus:border-emerald-400 focus:outline-none"
              >
                {demoProjects.map((item) => (
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
              >
                <option value="">Selecione uma turma</option>
                {availableCohorts.map((cohort) => (
                  <option key={cohort.id} value={cohort.id}>
                    {cohort.name} • {cohort.weekday} às {cohort.time}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="beneficiary" className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
                Beneficiária
              </label>
              <select
                id="beneficiary"
                value={selectedBeneficiaryId}
                onChange={(event) => setSelectedBeneficiaryId(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/80 focus:border-emerald-400 focus:outline-none"
              >
                <option value="">Selecione uma beneficiária</option>
                {demoBeneficiaries.map((beneficiary) => (
                  <option key={beneficiary.id} value={beneficiary.id}>
                    {beneficiary.name} • {beneficiary.status === 'aguardando' ? 'Lista de espera' : 'Ativa'}
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
            <Button type="button" onClick={handleCreateEnrollment}>
              Registrar inscrição
            </Button>
            <Button type="button" variant="secondary">
              Integrar com API /enrollments
            </Button>
          </div>
        </Card>

        <ProjectOverviewCard project={project} cohorts={availableCohorts} />
      </div>

      <EnrollmentTable enrollments={enrollments} />
    </Shell>
  );
}

interface ProjectOverviewCardProps {
  project?: DemoProject;
  cohorts: DemoCohort[];
}

function ProjectOverviewCard({ project, cohorts }: ProjectOverviewCardProps) {
  if (!project) {
    return null;
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
          <dd className="text-lg text-white">{project.enrolled}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.24em] text-white/40">Lista de espera</dt>
          <dd className="text-lg text-white">{project.waitlist}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.24em] text-white/40">Local</dt>
          <dd>{project.location}</dd>
        </div>
      </dl>

      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-[0.24em] text-white/50">Turmas disponíveis</h4>
        <ul className="space-y-2 text-xs text-white/70">
          {cohorts.map((cohort) => (
            <li key={cohort.id} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
              <p className="font-medium text-white">{cohort.name}</p>
              <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
                {cohort.weekday} • {cohort.time} • {cohort.educator}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </Card>
  );
}

interface EnrollmentTableProps {
  enrollments: LocalEnrollment[];
}

function EnrollmentTable({ enrollments }: EnrollmentTableProps) {
  if (enrollments.length === 0) {
    return (
      <Card className="space-y-3" padding="lg">
        <h3 className="text-lg font-semibold text-white">Nenhuma inscrição recente</h3>
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
          <h3 className="text-xl font-semibold text-white">Inscrições registradas nesta sessão</h3>
        </div>
        <Button type="button" variant="secondary">
          Exportar para planilha
        </Button>
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
                <td className="px-4 py-3 text-white">{enrollment.beneficiary.name}</td>
                <td className="px-4 py-3">{enrollment.project.name}</td>
                <td className="px-4 py-3">
                  {enrollment.cohort.name} • {enrollment.cohort.weekday}
                </td>
                <td className="px-4 py-3">{enrollment.startDate}</td>
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

function StatusPill({ status }: { status: LocalEnrollment['status'] }) {
  const labelMap: Record<LocalEnrollment['status'], string> = {
    ativa: 'Ativa',
    aguardando: 'Lista de espera',
    pendente: 'Pendente de aprovação',
  };
  const colorMap: Record<LocalEnrollment['status'], string> = {
    ativa: 'bg-emerald-500/20 text-emerald-100 border-emerald-400/40',
    aguardando: 'bg-amber-500/15 text-amber-100 border-amber-400/30',
    pendente: 'bg-cyan-500/15 text-cyan-100 border-cyan-400/30',
  };

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${colorMap[status]}`}>
      {labelMap[status]}
    </span>
  );
}
