'use client';

import { useState } from 'react';
import type { Filters } from '../types/analytics';
import { downloadFile } from '../lib/api';
import { useSession } from '../hooks/useSession';
import { Button } from './ui/button';

interface ExportButtonsProps {
  filters: Filters;
}

export function ExportButtons({ filters }: ExportButtonsProps) {
  const session = useSession();
  const [loading, setLoading] = useState<'csv' | 'pdf' | 'xlsx' | null>(null);

  async function handleExport(format: 'csv' | 'pdf' | 'xlsx') {
    if (!session) return;
    setLoading(format);
    try {
      const filename =
        format === 'pdf' ? 'dashboard.pdf' : format === 'xlsx' ? 'dashboard.xlsx' : 'dashboard.csv';
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
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => handleExport('csv')}
        disabled={loading !== null}
      >
        {loading === 'csv' ? 'Exportando CSV...' : 'Exportar CSV'}
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => handleExport('xlsx')}
        disabled={loading !== null}
      >
        {loading === 'xlsx' ? 'Gerando XLSX...' : 'Exportar XLSX'}
      </Button>
      <Button
        type="button"
        variant="primary"
        size="sm"
        className="bg-imm-indigo/60 text-white shadow-indigo-500/30 hover:bg-imm-indigo/50 focus:ring-imm-indigo/40 disabled:bg-imm-indigo/40"
        onClick={() => handleExport('pdf')}
        disabled={loading !== null}
      >
        {loading === 'pdf' ? 'Gerando PDF...' : 'Exportar PDF'}
      </Button>
    </div>
  );
}
