'use client';

import { useMemo, useState } from 'react';
import { Shell } from '../../components/Shell';
import { PrimarySidebar } from '../../components/PrimarySidebar';
import { useRequirePermission } from '../../hooks/useRequirePermission';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { demoBeneficiaries, demoCohorts, demoProjects } from '../../lib/demo-data';

type AttendanceStatus = 'presente' | 'falta_justificada' | 'falta_injustificada' | 'atraso';

interface LocalAttendance {
  beneficiaryId: string;
  status: AttendanceStatus;
  justification?: string;
}

const statusOptions: { value: AttendanceStatus; label: string }[] = [
  { value: 'presente', label: 'Presente' },
  { value: 'falta_justificada', label: 'Falta justificada' },
  { value: 'falta_injustificada', label: 'Falta injustificada' },
  { value: 'atraso', label: 'Atraso' },
];

export default function AttendancePage() {
  const session = useRequirePermission(['attendance:write']);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(demoProjects[0]?.id ?? '');
  const [selectedCohortId, setSelectedCohortId] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [records, setRecords] = useState<Record<string, LocalAttendance>>({});

  const primarySidebar = useMemo(() => (session ? <PrimarySidebar session={session} /> : null), [session]);
  const cohorts = demoCohorts.filter((cohort) => cohort.projectId === selectedProjectId);
  const cohort = cohorts.find((item) => item.id === selectedCohortId) ?? cohorts[0];
  const participants = demoBeneficiaries.filter((beneficiary) => beneficiary.status !== 'desligada');

  if (session === undefined) {
    return null;
  }

  const handleStatusChange = (beneficiaryId: string, status: AttendanceStatus) => {
    setRecords((prev) => ({
      ...prev,
      [beneficiaryId]: {
        ...prev[beneficiaryId],
        beneficiaryId,
        status,
      },
    }));
  };

  const handleJustificationChange = (beneficiaryId: string, justification: string) => {
    setRecords((prev) => ({
      ...prev,
      [beneficiaryId]: {
        ...prev[beneficiaryId],
        beneficiaryId,
        status: prev[beneficiaryId]?.status ?? 'falta_justificada',
        justification,
      },
    }));
  };

  const handleSave = () => {
    alert('Presenças salvas localmente. Integre com a rota /attendance para persistir.');
  };

  const summary = statusOptions.map((option) => ({
    status: option.label,
    total: Object.values(records).filter((record) => record.status === option.value).length,
  }));

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
              }}
              options={demoProjects.map((project) => ({ value: project.id, label: project.name }))}
            />

            <SelectField
              label="Turma"
              value={selectedCohortId}
              onChange={setSelectedCohortId}
              options={[{ value: '', label: 'Selecione' }, ...cohorts.map((item) => ({ value: item.id, label: `${item.name} • ${item.weekday}` }))]}
            />

            <DateField label="Data" value={date} onChange={setDate} />
          </div>

          <AttendanceTable
            participants={participants}
            records={records}
            onStatusChange={handleStatusChange}
            onJustificationChange={handleJustificationChange}
          />

          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={handleSave}>
              Salvar presença
            </Button>
            <Button type="button" variant="secondary">
              Exportar para PDF de lista
            </Button>
          </div>
        </Card>

        <SummaryCard cohortName={cohort?.name ?? 'Turma não selecionada'} summary={summary} />
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
  participants: typeof demoBeneficiaries;
  records: Record<string, LocalAttendance>;
  onStatusChange: (beneficiaryId: string, status: AttendanceStatus) => void;
  onJustificationChange: (beneficiaryId: string, justification: string) => void;
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
          {participants.map((beneficiary) => {
            const record = records[beneficiary.id];
            return (
              <tr key={beneficiary.id} className="hover:bg-white/5">
                <td className="px-4 py-3 text-white">{beneficiary.name}</td>
                <td className="px-4 py-3 text-xs text-white/60">{beneficiary.vulnerabilities.join(' • ')}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {statusOptions.map((option) => {
                      const isActive = record?.status === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => onStatusChange(beneficiary.id, option.value)}
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
                    onChange={(event) => onJustificationChange(beneficiary.id, event.target.value)}
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
