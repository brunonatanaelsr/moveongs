'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Shell } from '../../components/Shell';
import { PrimarySidebar } from '../../components/PrimarySidebar';
import { useRequirePermission } from '../../hooks/useRequirePermission';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import {
  listProjects,
  listProjectCohorts,
  listEnrollments,
  submitAttendanceRecords,
  type AttendanceFormStatus,
  type ProjectRecord,
  type CohortRecord,
  type EnrollmentListResponse,
} from '../../lib/operations';

type AttendanceStatus = AttendanceFormStatus;

interface LocalAttendance {
  enrollmentId: string;
  beneficiaryId: string;
  status: AttendanceStatus;
  justification?: string;
}

interface ParticipantRow {
  enrollmentId: string;
  beneficiaryId: string;
  name: string;
  vulnerabilities: string[];
  enrollmentStatus: string;
}

type ProjectsResponse = ProjectRecord[];
type CohortsResponse = CohortRecord[];
type EnrollmentsResponse = EnrollmentListResponse;

const statusOptions: { value: AttendanceStatus; label: string }[] = [
  { value: 'presente', label: 'Presente' },
  { value: 'falta_justificada', label: 'Falta justificada' },
  { value: 'falta_injustificada', label: 'Falta injustificada' },
  { value: 'atraso', label: 'Atraso' },
];

export default function AttendancePage() {
  const session = useRequirePermission(['attendance:write']);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedCohortId, setSelectedCohortId] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [records, setRecords] = useState<Record<string, LocalAttendance>>({});
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const primarySidebar = useMemo(() => (session ? <PrimarySidebar session={session} /> : null), [session]);

  const projectsKey = useMemo(() => {
    if (!session) return null;
    return ['attendance:projects', session.token] as const;
  }, [session]);

  const { data: projects } = useSWR<ProjectsResponse>(projectsKey, ([, token]) => listProjects(token));

  useEffect(() => {
    if (!selectedProjectId && projects?.length) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  const cohortsKey = useMemo(() => {
    if (!session || !selectedProjectId) return null;
    return ['attendance:cohorts', selectedProjectId, session.token] as const;
  }, [session, selectedProjectId]);

  const { data: cohorts } = useSWR<CohortsResponse>(cohortsKey, ([, projectId, token]) => listProjectCohorts(projectId, token));

  const enrollmentsKey = useMemo(() => {
    if (!session || !selectedProjectId) return null;
    return ['attendance:enrollments', selectedProjectId, selectedCohortId || 'all', session.token] as const;
  }, [session, selectedProjectId, selectedCohortId]);

  const { data: enrollmentsData } = useSWR<EnrollmentsResponse | undefined>(
    enrollmentsKey,
    ([, projectId, cohortId, token]) =>
      listEnrollments(
        {
          projectId,
          cohortId: cohortId === 'all' ? undefined : cohortId,
          activeOnly: true,
          limit: 200,
        },
        token,
      ),
  );

  const participants = useMemo<ParticipantRow[]>(() => {
    const items = enrollmentsData?.data ?? [];
    return items
      .filter((enrollment) => enrollment.status !== 'terminated')
      .map((enrollment) => ({
        enrollmentId: enrollment.id,
        beneficiaryId: enrollment.beneficiaryId,
        name: enrollment.beneficiary?.fullName ?? enrollment.beneficiaryId,
        vulnerabilities: enrollment.beneficiary?.vulnerabilities ?? [],
        enrollmentStatus: enrollment.status,
      }));
  }, [enrollmentsData]);

  useEffect(() => {
    setRecords((previous) => {
      const next: Record<string, LocalAttendance> = {};
      participants.forEach((participant) => {
        if (previous[participant.enrollmentId]) {
          next[participant.enrollmentId] = previous[participant.enrollmentId];
        }
      });
      const previousKeys = Object.keys(previous);
      const nextKeys = Object.keys(next);
      if (previousKeys.length === nextKeys.length && previousKeys.every((key) => next[key] === previous[key])) {
        return previous;
      }
      return next;
    });
  }, [participants]);

  if (session === undefined) {
    return null;
  }

  const handleStatusChange = (participant: ParticipantRow, status: AttendanceStatus) => {
    setRecords((prev) => ({
      ...prev,
      [participant.enrollmentId]: {
        ...prev[participant.enrollmentId],
        enrollmentId: participant.enrollmentId,
        beneficiaryId: participant.beneficiaryId,
        status,
        justification:
          status === 'presente' ? undefined : prev[participant.enrollmentId]?.justification,
      },
    }));
  };

  const handleJustificationChange = (participant: ParticipantRow, justification: string) => {
    setRecords((prev) => ({
      ...prev,
      [participant.enrollmentId]: {
        ...prev[participant.enrollmentId],
        enrollmentId: participant.enrollmentId,
        beneficiaryId: participant.beneficiaryId,
        status: prev[participant.enrollmentId]?.status ?? 'falta_justificada',
        justification,
      },
    }));
  };

  const handleSave = async () => {
    if (!session) return;

    const selectedRecords = participants
      .map((participant) => records[participant.enrollmentId])
      .filter((record): record is LocalAttendance => Boolean(record?.status));

    if (selectedRecords.length === 0) {
      setFeedback({ type: 'error', message: 'Selecione ao menos um status de presença para registrar.' });
      return;
    }

    const invalidJustification = selectedRecords.find(
      (record) =>
        (record.status === 'falta_justificada' || record.status === 'falta_injustificada') &&
        !(record.justification && record.justification.trim().length > 0),
    );

    if (invalidJustification) {
      setFeedback({ type: 'error', message: 'Informe uma justificativa para todas as ausências.' });
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const result = await submitAttendanceRecords(
        selectedRecords.map((record) => ({
          enrollmentId: record.enrollmentId,
          beneficiaryId: record.beneficiaryId,
          status: record.status,
          justification: record.justification?.trim(),
          date,
        })),
        session.token,
      );

      if (result.failures.length === 0) {
        setFeedback({ type: 'success', message: 'Presenças registradas com sucesso.' });
        setRecords({});
      } else if (result.successes === 0) {
        setFeedback({ type: 'error', message: 'Não foi possível registrar as presenças. Tente novamente.' });
      } else {
        setFeedback({
          type: 'error',
          message: `Alguns registros falharam (${result.failures.length}). Verifique os dados e tente novamente.`,
        });
      }
    } catch (error) {
      console.error(error);
      setFeedback({ type: 'error', message: 'Erro inesperado ao registrar presenças.' });
    } finally {
      setIsSaving(false);
    }
  };

  const summary = statusOptions.map((option) => ({
    status: option.label,
    total: Object.values(records).filter((record) => record.status === option.value).length,
  }));

  const cohort = selectedCohortId
    ? cohorts?.find((item) => item.id === selectedCohortId)
    : undefined;
  const cohortName = selectedCohortId
    ? cohort?.name ?? 'Turma não selecionada'
    : cohorts && cohorts.length > 0
      ? 'Todas as turmas'
      : 'Turma não selecionada';

  return (
    <Shell
      title="Registro de presenças"
      description="Acompanhe a assiduidade das beneficiárias e sinalize riscos de evasão em tempo real."
      sidebar={primarySidebar}
    >
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Card className="space-y-4" padding="lg">
          <header className="space-y-1">
            <p className="text-xs uppercase tracking-[0.28em] text-white/50">Configuração da lista</p>
            <h2 className="text-2xl font-semibold text-white">Selecione projeto, turma e data</h2>
          </header>

          <div className="grid gap-4 md:grid-cols-3">
            <SelectField
              label="Projeto"
              value={selectedProjectId}
              onChange={(value) => {
                setSelectedProjectId(value);
                setSelectedCohortId('');
                setRecords({});
                setFeedback(null);
              }}
              options={(projects ?? []).map((project) => ({ value: project.id, label: project.name }))}
            />

            <SelectField
              label="Turma"
              value={selectedCohortId}
              onChange={(value) => {
                setSelectedCohortId(value);
                setRecords({});
                setFeedback(null);
              }}
              options={[
                { value: '', label: 'Todas as turmas' },
                ...(cohorts ?? []).map((item) => ({ value: item.id, label: item.name })),
              ]}
            />

            <DateField label="Data" value={date} onChange={setDate} />
          </div>

          {feedback && (
            <div
              className={`rounded-3xl border p-4 text-sm ${
                feedback.type === 'success'
                  ? 'border-emerald-300/40 bg-emerald-500/10 text-emerald-100'
                  : 'border-rose-300/40 bg-rose-500/10 text-rose-100'
              }`}
              role="status"
              aria-live="polite"
            >
              {feedback.message}
            </div>
          )}

          <AttendanceTable
            participants={participants}
            records={records}
            onStatusChange={handleStatusChange}
            onJustificationChange={handleJustificationChange}
          />

          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Salvando...' : 'Salvar presença'}
            </Button>
            <Button type="button" variant="secondary">
              Exportar para PDF de lista
            </Button>
          </div>
        </Card>

        <SummaryCard cohortName={cohortName} summary={summary} />
      </div>
    </Shell>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

function SelectField({ label, value, onChange, options }: SelectFieldProps) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">{label}</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/80 focus:border-emerald-400 focus:outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">{label}</label>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/80 focus:border-emerald-400 focus:outline-none"
      />
    </div>
  );
}

interface AttendanceTableProps {
  participants: ParticipantRow[];
  records: Record<string, LocalAttendance>;
  onStatusChange: (participant: ParticipantRow, status: AttendanceStatus) => void;
  onJustificationChange: (participant: ParticipantRow, justification: string) => void;
}

function AttendanceTable({ participants, records, onStatusChange, onJustificationChange }: AttendanceTableProps) {
  return (
    <div className="overflow-hidden rounded-3xl border border-white/10">
      <table className="min-w-full divide-y divide-white/10 text-sm text-white/80">
        <thead className="bg-white/5 text-xs uppercase tracking-[0.22em] text-white/50">
          <tr>
            <th className="px-4 py-3 text-left">Beneficiária</th>
            <th className="px-4 py-3 text-left">Vulnerabilidades</th>
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3 text-left">Justificativa</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10 bg-white/0">
          {participants.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-sm text-white/60">
                Nenhuma participante encontrada para os filtros selecionados.
              </td>
            </tr>
          )}
          {participants.map((participant) => {
            const record = records[participant.enrollmentId];
            return (
              <tr key={participant.enrollmentId} className="hover:bg-white/5">
                <td className="px-4 py-3 text-white">{participant.name}</td>
                <td className="px-4 py-3 text-xs text-white/60">
                  {participant.vulnerabilities.length > 0
                    ? participant.vulnerabilities.join(' • ')
                    : 'Sem vulnerabilidades registradas'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {statusOptions.map((option) => {
                      const isActive = record?.status === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => onStatusChange(participant, option.value)}
                          className={`rounded-full border px-3 py-1 text-xs transition ${
                            isActive
                              ? 'border-emerald-400/70 bg-emerald-500/20 text-emerald-100'
                              : 'border-white/10 bg-white/5 text-white/60 hover:border-white/30 hover:bg-white/10'
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <input
                    type="text"
                    value={record?.justification ?? ''}
                    onChange={(event) => onJustificationChange(participant, event.target.value)}
                    placeholder="Opcional"
                    className="w-full rounded-2xl border border-white/10 bg-white/5 p-2 text-xs text-white/70 focus:border-emerald-400 focus:outline-none"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface SummaryCardProps {
  cohortName: string;
  summary: { status: string; total: number }[];
}

function SummaryCard({ cohortName, summary }: SummaryCardProps) {
  return (
    <Card className="space-y-4" padding="lg">
      <header>
        <p className="text-xs uppercase tracking-[0.28em] text-white/50">Resumo rápido</p>
        <h3 className="mt-1 text-xl font-semibold text-white">{cohortName}</h3>
        <p className="text-xs text-white/70">Distribuição dos registros deste encontro.</p>
      </header>

      <ul className="space-y-3 text-sm text-white/80">
        {summary.map((item) => (
          <li key={item.status} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <span>{item.status}</span>
            <span className="text-lg font-semibold text-white">{item.total}</span>
          </li>
        ))}
      </ul>

      <div className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-4 text-xs text-cyan-100">
        Sincronize estes dados com o backend para atualizar dashboards e alertas de risco de evasão.
      </div>
    </Card>
  );
}
