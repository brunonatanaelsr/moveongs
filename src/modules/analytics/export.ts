import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getAnalyticsOverview } from './service';
import type { OverviewFilters } from './types';
import type { OverviewResponse } from './service';

const execFileAsync = promisify(execFile);

export async function exportAnalyticsCsv(filters: OverviewFilters): Promise<{ filename: string; content: string }> {
  const data = await getAnalyticsOverview(filters);
  const csv = buildCsv(data);
  const filename = `analytics-${new Date().toISOString().slice(0,10)}.csv`;
  return { filename, content: csv };
}

export async function exportAnalyticsPdf(filters: OverviewFilters): Promise<{ filename: string; buffer: Buffer }> {
  const overview = await getAnalyticsOverview(filters);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'imm-analytics-'));
  try {
    const templatePath = path.resolve('tools/pdf-renderer/templates/dashboard_summary.hbs');
    const dataPath = path.join(tempDir, 'data.json');
    const outputPath = path.join(tempDir, 'report.pdf');

    await fs.writeFile(dataPath, JSON.stringify({ generatedAt: new Date().toISOString(), overview }, null, 2));

    const renderer = path.resolve('tools/pdf-renderer/render_pdf.js');
    await execFileAsync('node', [renderer, templatePath, dataPath, outputPath], { env: process.env });

    const buffer = await fs.readFile(outputPath);
    const filename = `analytics-${new Date().toISOString().slice(0,10)}.pdf`;
    return { filename, buffer };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function buildCsv(overview: OverviewResponse): string {
  const lines: string[] = [];

  lines.push('Indicador,Valor');
  lines.push(`Beneficiarias ativas,${overview.kpis.beneficiarias_ativas}`);
  lines.push(`Novas beneficiarias,${overview.kpis.novas_beneficiarias}`);
  lines.push(`Matriculas ativas,${overview.kpis.matriculas_ativas}`);
  lines.push(`Assiduidade media,${formatPercentage(overview.kpis.assiduidade_media)}`);
  lines.push(`Consentimentos pendentes,${overview.kpis.consentimentos_pendentes}`);
  lines.push('');

  lines.push('Serie novas beneficiarias');
  lines.push('Data,Quantidade');
  for (const item of overview.series.novas_beneficiarias) {
    lines.push(`${item.t},${item.v}`);
  }
  lines.push('');

  lines.push('Serie novas matriculas');
  lines.push('Data,Quantidade');
  for (const item of overview.series.novas_matriculas) {
    lines.push(`${item.t},${item.v}`);
  }
  lines.push('');

  lines.push('Assiduidade media');
  lines.push('Data,Taxa');
  for (const item of overview.series.assiduidade_media) {
    lines.push(`${item.t},${formatPercentage(item.v)}`);
  }
  lines.push('');

  lines.push('Assiduidade por projeto');
  lines.push('Projeto,Assiduidade');
  for (const item of overview.categorias.assiduidade_por_projeto) {
    lines.push(`${escapeCsv(item.projeto)},${formatPercentage(item.valor)}`);
  }
  lines.push('');

  lines.push('Vulnerabilidades');
  lines.push('Tipo,Quantidade');
  for (const item of overview.categorias.vulnerabilidades) {
    lines.push(`${escapeCsv(item.tipo)},${item.qtd}`);
  }
  lines.push('');

  lines.push('Faixa etaria');
  lines.push('Faixa,Quantidade');
  for (const item of overview.categorias.faixa_etaria) {
    lines.push(`${escapeCsv(item.faixa)},${item.qtd}`);
  }
  lines.push('');

  lines.push('Bairros');
  lines.push('Bairro,Quantidade');
  for (const item of overview.categorias.bairros) {
    lines.push(`${escapeCsv(item.bairro)},${item.qtd}`);
  }
  lines.push('');

  lines.push('Capacidade por projeto');
  lines.push('Projeto,Ocupadas,Capacidade');
  for (const item of overview.categorias.capacidade_projeto) {
    lines.push(`${escapeCsv(item.projeto)},${item.ocupadas},${item.capacidade}`);
  }
  lines.push('');

  lines.push('Plano de acao por status');
  lines.push('Status,Quantidade');
  for (const item of overview.categorias.plano_acao_status) {
    lines.push(`${escapeCsv(item.status)},${item.qtd}`);
  }
  lines.push('');

  lines.push('Risco de evasao');
  lines.push('Beneficiaria,Projeto,Turma,Assiduidade');
  for (const item of overview.listas.risco_evasao) {
    lines.push(`${escapeCsv(item.beneficiaria)},${escapeCsv(item.projeto)},${escapeCsv(item.turma)},${formatPercentage(item.assiduidade)}`);
  }
  lines.push('');

  lines.push('Consentimentos pendentes ou revogados');
  lines.push('Beneficiaria,Tipo,Desde');
  for (const item of overview.listas.consentimentos_pendentes) {
    lines.push(`${escapeCsv(item.beneficiaria)},${escapeCsv(item.tipo)},${item.desde}`);
  }

  return lines.join('\n');
}

function formatPercentage(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return '';
  }
  return (Number(value) * 100).toFixed(2);
}

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
