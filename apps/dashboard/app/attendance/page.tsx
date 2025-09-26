'use client';

import { useEffect, useMemo, useState, useId } from 'react';
import { Shell } from '../../components/Shell';
import { PrimarySidebar } from '../../components/PrimarySidebar';
import { useRequirePermission } from '../../hooks/useRequirePermission';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { useProjects, useCohorts } from '../../hooks/useProjects';
import { useAttendance, useEnrollments, type AttendanceMap } from '../../hooks/useEnrollments';
import { postJson } from '../../lib/api';
import { LoadingState } from '../../components/LoadingState';
import type { AttendanceRecord } from '../../types/operations';

const statusOptions: { value: AttendanceRecord['status']; label: string }[] = [
  { value: 'presente', label: 'Presente' },
  { value: 'ausente', label: 'Ausente' },
  { value: 'justificado', label: 'Justificada' },
];

interface AttendanceDraft {
  status: AttendanceRecord['status'];
  justification: string;
}

export default function AttendancePage() {
  const session = useRequirePermission(['attendance:write']);
  const { projects, isLoading: loadingProjects } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedCohortId, setSelectedCohortId] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [drafts, setDrafts] = useState<Record<string, AttendanceDraft>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  const { cohorts } = useCohorts(selectedProjectId || undefined);
  useEffect(() => {
    if (cohorts.length > 0) {
      setSelectedCohortId((current) => (current && cohorts.some((c) => c.id === current) ? current : cohorts[0].id));
    }
  }, [cohorts]);

  const { enrollments, mutateEnrollments } = useEnrollments(selectedProjectId || undefined);
  const cohortEnrollments = useMemo(
    () => enrollments.filter((enrollment) => enrollment.cohortId === selectedCohortId),
    [enrollments, selectedCohortId],
  );
  const enrollmentIds = useMemo(() => cohortEnrollments.map((enrollment) => enrollment.id), [cohortEnrollments]);
  const { attendanceByEnrollment, mutateAttendance } = useAttendance(enrollmentIds);

  useEffect(() => {
    setDrafts({});
  }, [selectedCohortId, enrollmentIds.join(',')]);

  const primarySidebar = useMemo(() => (session ? <PrimarySidebar session={session} /> : null), [session]);

  const notify = (message: string) => {
    setFeedback(message);
    window.setTimeout(() => setFeedback(null), 4000);
  };

  if (session === undefined || loadingProjects) {
    return <LoadingState message="Carregando dados de presença..." />;
  }

  if (!session) {
    return <LoadingState message="Carregando..." />;
  }

  const handleDraftChange = (enrollmentId: string, partial: Partial<AttendanceDraft>) => {
    setDrafts((prev) => {
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

  const handleSave = async () => {
    if (cohortEnrollments.length === 0) {
      notify('Selecione uma turma com matrículas ativas para registrar presença.');
      return;
    }

    const snapshot: AttendanceMap = Object.fromEntries(
      Object.entries(attendanceByEnrollment).map(([id, records]) => [id, [...records]]),
    );

    const updates = cohortEnrollments.map((enrollment) => {
      const draft = drafts[enrollment.id] ?? { status: 'presente', justification: '' };
      const record: AttendanceRecord = {
        id: `attendance-${Math.random().toString(36).slice(2, 10)}`,
        date,
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
      notify('Presenças registradas com sucesso.');
    } catch (error) {
      await mutateAttendance(snapshot, false);
      notify('Não foi possível sincronizar as presenças com a API.');
    }
  };

  const summary = statusOptions.map((option) => ({
    status: option.label,
    total: cohortEnrollments.filter((enrollment) => {
      const records = attendanceByEnrollment[enrollment.id] ?? [];
      const latest = records.at(-1);
      return (latest?.date === date && latest?.status === option.value) ||
        ((drafts[enrollment.id]?.status ?? 'presente') === option.value && !latest);
    }).length,
  }));

  return (
    <Shell
      title="Registro de presenças"
      description="Acompanhe a assiduidade das beneficiárias e sinalize riscos de evasão em tempo real."
      sidebar={primarySidebar}
    >
      {feedback && (
        <div className="mb-6 rounded-3xl border border-emerald-300/40 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          {feedback}
        </div>
      )}
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
              onChange={(value) => setSelectedProjectId(value)}
              options={projects.map((project) => ({ value: project.id, label: project.name }))}
            />

            <SelectField
              label="Turma"
              value={selectedCohortId}
              onChange={(value) => setSelectedCohortId(value)}
              options={[{ value: '', label: 'Selecione' }, ...cohorts.map((item) => ({ value: item.id, label: `${item.name} • ${item.schedule}` }))]}
            />

            <DateField label="Data" value={date} onChange={setDate} />
          </div>

          <AttendanceTable
            participants={cohortEnrollments}
            records={drafts}
            persisted={attendanceByEnrollment}
            onStatusChange={(beneficiaryId, status) => handleDraftChange(beneficiaryId, { status })}
            onJustificationChange={(beneficiaryId, justification) => handleDraftChange(beneficiaryId, { justification })}
          />

          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={handleSave}>
              Salvar presença
            </Button>
            <Button type="button" variant="secondary" onClick={() => mutateEnrollments()}>
              Atualizar matrículas
            </Button>
          </div>
        </Card>

        <SummaryCard cohortName={cohorts.find((cohort) => cohort.id === selectedCohortId)?.name ?? 'Turma não selecionada'} summary={summary} />
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
  const selectId = useId();
  return (
    <div className="space-y-2">
      <label
        htmlFor={selectId}
        className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60"
      >
        {label}
      </label>
      <select
        id={selectId}
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
  const inputId = useId();
  return (
    <div className="space-y-2">
      <label
        htmlFor={inputId}
        className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60"
      >
        {label}
      </label>
      <input
        id={inputId}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/80 focus:border-emerald-400 focus:outline-none"
      />
    </div>
  );
}

interface AttendanceTableProps {
  participants: ReturnType<typeof useEnrollments>['enrollments'];
  records: Record<string, AttendanceDraft>;
  persisted: AttendanceMap;
  onStatusChange: (beneficiaryId: string, status: AttendanceRecord['status']) => void;
  onJustificationChange: (beneficiaryId: string, justification: string) => void;
}

function AttendanceTable({ participants, records, persisted, onStatusChange, onJustificationChange }: AttendanceTableProps) {
  return (
    <div className="overflow-hidden rounded-3xl border border-white/10">
      <table className="min-w-full divide-y divide-white/10 text-sm text-white/80">
        <thead className="bg-white/5 text-xs uppercase tracking-[0.22em] text-white/50">
          <tr>
            <th className="px-4 py-3 text-left">Beneficiária</th>
            <th className="px-4 py-3 text-left">Últimos registros</th>
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3 text-left">Justificativa</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10 bg-white/0">
          {participants.map((enrollment) => {
            const record = records[enrollment.id] ?? { status: 'presente', justification: '' };
            const lastPersisted = persisted[enrollment.id]?.at(-1);
            return (
              <tr key={enrollment.id} className="hover:bg-white/5">
                <td className="px-4 py-3 text-white">{enrollment.beneficiary.name}</td>
                <td className="px-4 py-3 text-xs text-white/60">
                  {lastPersisted
                    ? `${new Date(lastPersisted.date).toLocaleDateString('pt-BR')} • ${statusOptions.find((option) => option.value === lastPersisted.status)?.label ?? lastPersisted.status}`
                    : 'Sem registros anteriores'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {statusOptions.map((option) => {
                      const isActive = record.status === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => onStatusChange(enrollment.id, option.value)}
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
                  <Input
                    type="text"
                    value={record.justification}
                    onChange={(event) => onJustificationChange(enrollment.id, event.target.value)}
                    placeholder="Opcional"
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
