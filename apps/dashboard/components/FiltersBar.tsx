'use client';

import { ChangeEvent } from 'react';
import { Filters } from '../types/analytics';
import { useProjects, useCohorts } from '../hooks/useProjects';

interface FiltersBarProps {
  filters: Filters;
  onChange: (partial: Partial<Filters>) => void;
  onReset: () => void;
}

export function FiltersBar({ filters, onChange, onReset }: FiltersBarProps) {
  const projects = useProjects();
  const cohorts = useCohorts(filters.projectId);

  function handleInput(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    onChange({ [name]: value || undefined });
  }

  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-black/20 backdrop-blur-3xl lg:flex-row lg:items-end">
      <div className="flex flex-1 flex-col gap-2">
        <label className="text-xs uppercase tracking-wide text-white/60" htmlFor="from">
          De
        </label>
        <input
          id="from"
          name="from"
          type="date"
          value={filters.from ?? ''}
          onChange={handleInput}
          className="rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-imm-cyan"
        />
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <label className="text-xs uppercase tracking-wide text-white/60" htmlFor="to">
          Até
        </label>
        <input
          id="to"
          name="to"
          type="date"
          value={filters.to ?? ''}
          onChange={handleInput}
          className="rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-imm-cyan"
        />
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <label className="text-xs uppercase tracking-wide text-white/60" htmlFor="projectId">
          Projeto
        </label>
        <select
          id="projectId"
          name="projectId"
          value={filters.projectId ?? ''}
          onChange={(event) => {
            onChange({ projectId: event.target.value || undefined, cohortId: undefined });
          }}
          className="rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-imm-cyan"
        >
          <option value="">Todos</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <label className="text-xs uppercase tracking-wide text-white/60" htmlFor="cohortId">
          Turma
        </label>
        <select
          id="cohortId"
          name="cohortId"
          value={filters.cohortId ?? ''}
          onChange={handleInput}
          className="rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-imm-cyan"
          disabled={!filters.projectId}
        >
          <option value="">Todas</option>
          {cohorts.map((cohort) => (
            <option key={cohort.id} value={cohort.id}>
              {cohort.code ?? cohort.id.slice(0, 6)}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        onClick={onReset}
        className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40"
      >
        Resetar filtros
      </button>
    </div>
  );
}
