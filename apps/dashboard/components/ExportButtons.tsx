'use client';

import { useState } from 'react';
import type { Filters } from '../types/analytics';
import { downloadFile } from '../lib/api';
import { useSession } from '../hooks/useSession';

interface ExportButtonsProps {
  filters: Filters;
}

export function ExportButtons({ filters }: ExportButtonsProps) {
  const session = useSession();
  const [loading, setLoading] = useState<'csv' | 'pdf' | null>(null);

  async function handleExport(format: 'csv' | 'pdf') {
    if (!session) return;
    setLoading(format);
    try {
      const filename = format === 'pdf' ? 'dashboard.pdf' : 'dashboard.csv';
      await downloadFile('/analytics/export', { ...filters, format }, session.token, filename);
    } catch (error) {
      console.error('Export failed', error);
      alert('Não foi possível exportar os dados.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => handleExport('csv')}
        disabled={loading !== null}
        className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40 disabled:opacity-60"
      >
        {loading === 'csv' ? 'Exportando CSV...' : 'Exportar CSV'}
      </button>
      <button
        type="button"
        onClick={() => handleExport('pdf')}
        disabled={loading !== null}
        className="rounded-2xl border border-white/10 bg-imm-indigo/40 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40 disabled:opacity-60"
      >
        {loading === 'pdf' ? 'Gerando PDF...' : 'Exportar PDF'}
      </button>
    </div>
  );
}
