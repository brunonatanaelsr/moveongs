'use client';

import React from 'react';
import { Shell } from '../components/Shell';
import { useRequirePermission } from '../hooks/useRequirePermission';
import { useDashboardFilters } from '../hooks/useDashboardFilters';
import { useAnalyticsOverview } from '../hooks/useAnalyticsData';
import { KpiCard } from '../components/KpiCard';
import { TimeSeriesChart } from '../components/TimeSeriesChart';
import { CategoryBarChart } from '../components/CategoryBarChart';
import { PieBlock } from '../components/PieBlock';
import { CapacityUtilization } from '../components/CapacityUtilization';
import { RiskTable } from '../components/RiskTable';
import { ConsentTable } from '../components/ConsentTable';
import { FiltersBar } from '../components/FiltersBar';
import { ExportButtons } from '../components/ExportButtons';
import { LoadingState } from '../components/LoadingState';
import { MessageCenter } from '../components/MessageCenter';
import { InstitutionalFeed } from '../components/InstitutionalFeed';
import { ActionPlanPanel } from '../components/ActionPlanPanel';
import { formatCount, formatPercent } from '../utils/format';

export default function DashboardPage() {
  const session = useRequirePermission(['analytics:read', 'analytics:read:project']);
  const { filters, update, reset } = useDashboardFilters();
  const { overview, isLoading, error } = useAnalyticsOverview(filters);

  if (!session) {
    return <LoadingState message="Verificando sessão..." />;
  }

  return (
    <Shell
      title="Dashboard institucional"
      description="Acompanhe indicadores-chave, presença e consentimentos das beneficiárias do Instituto Move Marias."
      headerExtra={<ExportButtons filters={filters} />}
    >
      <FiltersBar filters={filters} onChange={update} onReset={reset} />

      {isLoading && !overview && <LoadingState />}
      {error && (
        <div className="rounded-3xl border border-rose-400/40 bg-rose-500/10 p-6 text-rose-100">
          Ocorreu um erro ao carregar os dados. Tente novamente mais tarde.
        </div>
      )}

      {overview && (
        <div className="flex flex-col gap-8">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <KpiCard label="Beneficiárias ativas" value={formatCount(overview.kpis.beneficiarias_ativas)} accent="cyan" />
            <KpiCard label="Novas beneficiárias" value={formatCount(overview.kpis.novas_beneficiarias)} accent="emerald" />
            <KpiCard label="Matrículas ativas" value={formatCount(overview.kpis.matriculas_ativas)} accent="indigo" />
            <KpiCard
              label="Assiduidade média"
              value={formatPercent(overview.kpis.assiduidade_media)}
              accent="emerald"
            />
            <KpiCard label="Consentimentos pendentes" value={formatCount(overview.kpis.consentimentos_pendentes)} accent="rose" />
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <TimeSeriesChart title="Novas beneficiárias (histórico)" data={overview.series.novas_beneficiarias} />
            <TimeSeriesChart title="Novas matrículas" data={overview.series.novas_matriculas} />
            <TimeSeriesChart title="Assiduidade média" data={overview.series.assiduidade_media} valueType="percent" />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <CategoryBarChart
              title="Assiduidade por projeto"
              data={overview.categorias.assiduidade_por_projeto.map((item) => ({
                label: item.projeto,
                value: item.valor,
              }))}
              valueType="percent"
            />
            <CategoryBarChart
              title="Distribuição por bairros"
              data={overview.categorias.bairros.map((item) => ({
                label: item.bairro,
                value: item.qtd,
              }))}
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <PieBlock
              title="Vulnerabilidades"
              data={overview.categorias.vulnerabilidades.map((item) => ({
                label: item.tipo,
                value: item.qtd,
              }))}
            />
            <PieBlock
              title="Plano de Ação por status"
              data={overview.categorias.plano_acao_status.map((item) => ({
                label: item.status,
                value: item.qtd,
              }))}
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <CategoryBarChart
              title="Faixa etária"
              data={overview.categorias.faixa_etaria.map((item) => ({
                label: item.faixa,
                value: item.qtd,
              }))}
            />
            <CapacityUtilization data={overview.categorias.capacidade_projeto} />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <RiskTable data={overview.listas.risco_evasao} />
            <ConsentTable data={overview.listas.consentimentos_pendentes} />
          </section>
        </div>
      )}

      <MessageCenter />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <InstitutionalFeed />
        <ActionPlanPanel />
      </div>
    </Shell>
  );
}
