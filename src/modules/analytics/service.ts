import { query } from '../../db';
import { getRedis } from '../../config/redis';
import { getEnv } from '../../config/env';
import { logger } from '../../config/logger';
import type { OverviewFilters } from './types';

const DEFAULT_RANGE_DAYS = 30;

type KpiResponse = {
  beneficiarias_ativas: number;
  novas_beneficiarias: number;
  matriculas_ativas: number;
  assiduidade_media: number | null;
  consentimentos_pendentes: number;
};

type SeriesResponse = {
  novas_beneficiarias: Array<{ t: string; v: number }>;
  novas_matriculas: Array<{ t: string; v: number }>;
  assiduidade_media: Array<{ t: string; v: number | null }>;
};

type CategoriasResponse = {
  assiduidade_por_projeto: Array<{ projeto: string; valor: number | null }>;
  vulnerabilidades: Array<{ tipo: string; qtd: number }>;
  faixa_etaria: Array<{ faixa: string; qtd: number }>;
  bairros: Array<{ bairro: string; qtd: number }>;
  capacidade_projeto: Array<{ projeto: string; ocupadas: number; capacidade: number }>;
  plano_acao_status: Array<{ status: string; qtd: number }>;
};

type ListasResponse = {
  risco_evasao: Array<{ beneficiaria: string; projeto: string; turma: string; assiduidade: number | null }>;
  consentimentos_pendentes: Array<{ beneficiaria: string; tipo: string; desde: string }>;
};

export type OverviewResponse = {
  kpis: KpiResponse;
  series: SeriesResponse;
  categorias: CategoriasResponse;
  listas: ListasResponse;
};

export type TimeseriesMetric = 'beneficiarias' | 'matriculas' | 'assiduidade';

export function resolveDateRange(from?: string, to?: string): { from: Date; to: Date } {
  const today = startOfDay(new Date());
  const toDate = to ? startOfDay(new Date(to)) : today;
  const fromDate = from
    ? startOfDay(new Date(from))
    : startOfDay(new Date(toDate.getTime() - (DEFAULT_RANGE_DAYS - 1) * 24 * 60 * 60 * 1000));

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new Error('Invalid date format. Use YYYY-MM-DD.');
  }

  if (fromDate > toDate) {
    throw new Error('Invalid date range: `from` must be before `to`.');
  }

  return { from: fromDate, to: toDate };
}

function startOfDay(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return d;
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function applyProjectFilters(
  filters: OverviewFilters,
  whereParts: string[],
  values: unknown[],
  projectColumn: string,
  cohortColumn: string,
) {
  if (filters.projectId) {
    values.push(filters.projectId);
    whereParts.push(`${projectColumn} = $${values.length}`);
  } else if (filters.allowedProjectIds && filters.allowedProjectIds.length > 0) {
    values.push(filters.allowedProjectIds);
    whereParts.push(`${projectColumn} = any($${values.length}::uuid[])`);
  }

  if (filters.cohortId) {
    values.push(filters.cohortId);
    whereParts.push(`${cohortColumn} = $${values.length}`);
  }
}

async function withCache<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const redis = getRedis();
  if (!redis) {
    return factory();
  }

  try {
    if (redis.status === 'wait' || redis.status === 'end') {
      await redis.connect();
    }
    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached) as T;
    }
    const result = await factory();
    const ttl = parseInt(getEnv().CACHE_TTL_SECONDS, 10) || 300;
    await redis.set(key, JSON.stringify(result), 'EX', ttl);
    return result;
  } catch (error) {
    logger.warn({ error, key }, 'analytics cache failure');
    return factory();
  }
}

function buildProjectArray(filters: OverviewFilters): string[] | null {
  if (filters.projectId) {
    return [filters.projectId];
  }
  if (filters.allowedProjectIds && filters.allowedProjectIds.length > 0) {
    return filters.allowedProjectIds;
  }
  return null;
}

export async function getAnalyticsOverview(filters: OverviewFilters): Promise<OverviewResponse> {
  const { from, to } = resolveDateRange(filters.from, filters.to);
  const fromISO = toISODate(from);
  const toISO = toISODate(to);
  const cacheKey = `analytics:overview:${fromISO}:${toISO}:${filters.projectId ?? 'all'}:${filters.cohortId ?? 'all'}:${filters.scopeKey}`;

  return withCache(cacheKey, async () => {
    const projectArray = buildProjectArray(filters);
    const [kpis, series, categorias, listas] = await Promise.all([
      fetchKpis(filters, fromISO, toISO),
      fetchSeries(filters, fromISO, toISO, projectArray),
      fetchCategorias(filters, fromISO, toISO, projectArray),
      fetchListas(filters, fromISO, toISO, projectArray),
    ]);

    return { kpis, series, categorias, listas };
  });
}

export async function getAnalyticsTimeseries(metric: TimeseriesMetric, filters: OverviewFilters) {
  const { from, to } = resolveDateRange(filters.from, filters.to);
  const interval = filters.interval ?? 'day';
  const projectArray = buildProjectArray(filters);
  const cohortId = filters.cohortId ?? null;
  const fromISO = toISODate(from);
  const toISO = toISODate(to);
  const cacheKey = `analytics:timeseries:${metric}:${interval}:${fromISO}:${toISO}:${filters.projectId ?? 'all'}:${filters.cohortId ?? 'all'}:${filters.scopeKey}`;

  return withCache(cacheKey, async () => {
    switch (metric) {
      case 'beneficiarias': {
        const { rows } = await query<{ bucket_date: string; total: number }>(
          `select bucket_date::text, total
             from imm_series_new_beneficiaries($1::date, $2::date, $3::text, $4::uuid[])`,
          [fromISO, toISO, interval, projectArray],
        );
        return rows.map((row) => ({ t: row.bucket_date, v: Number(row.total) }));
      }
      case 'matriculas': {
        const { rows } = await query<{ bucket_date: string; total: number }>(
          `select bucket_date::text, total
             from imm_series_new_enrollments($1::date, $2::date, $3::text, $4::uuid[], $5::uuid)`,
          [fromISO, toISO, interval, projectArray, cohortId],
        );
        return rows.map((row) => ({ t: row.bucket_date, v: Number(row.total) }));
      }
      case 'assiduidade':
      default: {
        const { rows } = await query<{ bucket_date: string; rate: number | null }>(
          `select bucket_date::text, rate
             from imm_series_attendance($1::date, $2::date, $3::text, $4::uuid[], $5::uuid)`,
          [fromISO, toISO, interval, projectArray, cohortId],
        );
        return rows.map((row) => ({ t: row.bucket_date, v: row.rate === null ? null : Number(row.rate) }));
      }
    }
  });
}

export async function getProjectAnalytics(projectId: string, filters: OverviewFilters) {
  return getAnalyticsOverview({ ...filters, projectId });
}

async function fetchKpis(filters: OverviewFilters, fromISO: string, toISO: string): Promise<KpiResponse> {
  const [beneficiariasAtivas, novasBeneficiarias, matriculasAtivas, assiduidadeMedia, consentimentosPendentes] = await Promise.all([
    countBeneficiariasAtivas(filters, fromISO, toISO),
    countNovasBeneficiarias(filters, fromISO, toISO),
    countMatriculasAtivas(filters, fromISO, toISO),
    calcularAssiduidadeMedia(filters, fromISO, toISO),
    countConsentimentosPendentes(filters, fromISO, toISO),
  ]);

  return {
    beneficiarias_ativas: beneficiariasAtivas,
    novas_beneficiarias: novasBeneficiarias,
    matriculas_ativas: matriculasAtivas,
    assiduidade_media: assiduidadeMedia,
    consentimentos_pendentes: consentimentosPendentes,
  };
}

async function countBeneficiariasAtivas(filters: OverviewFilters, fromISO: string, toISO: string): Promise<number> {
  const whereParts = [
    "e.status = 'active'",
    '(e.enrolled_at <= $2)',
    '(e.terminated_at is null or e.terminated_at >= $1)',
  ];
  const values: unknown[] = [fromISO, toISO];
  applyProjectFilters(filters, whereParts, values, 'c.project_id', 'e.cohort_id');

  const { rows } = await query<{ count: string }>(
    `select count(distinct e.beneficiary_id) as count
       from enrollments e
       join cohorts c on c.id = e.cohort_id
      where ${whereParts.join(' and ')}`,
    values,
  );

  return Number(rows[0]?.count ?? 0);
}

async function countNovasBeneficiarias(filters: OverviewFilters, fromISO: string, toISO: string): Promise<number> {
  const whereParts = ['b.created_at::date between $1 and $2'];
  const values: unknown[] = [fromISO, toISO];
  applyProjectFilters(filters, whereParts, values, 'c.project_id', 'e.cohort_id');

  const { rows } = await query<{ count: string }>(
    `select count(distinct b.id) as count
       from beneficiaries b
       left join enrollments e on e.beneficiary_id = b.id
       left join cohorts c on c.id = e.cohort_id
      where ${whereParts.join(' and ')}`,
    values,
  );

  return Number(rows[0]?.count ?? 0);
}

async function countMatriculasAtivas(filters: OverviewFilters, fromISO: string, toISO: string): Promise<number> {
  const whereParts = [
    "e.status = 'active'",
    '(e.enrolled_at <= $2)',
    '(e.terminated_at is null or e.terminated_at >= $1)',
  ];
  const values: unknown[] = [fromISO, toISO];
  applyProjectFilters(filters, whereParts, values, 'c.project_id', 'e.cohort_id');

  const { rows } = await query<{ count: string }>(
    `select count(*) as count
       from enrollments e
       join cohorts c on c.id = e.cohort_id
      where ${whereParts.join(' and ')}`,
    values,
  );

  return Number(rows[0]?.count ?? 0);
}

async function calcularAssiduidadeMedia(filters: OverviewFilters, fromISO: string, toISO: string): Promise<number | null> {
  const projectArray = buildProjectArray(filters);
  const cohortId = filters.cohortId ?? null;

  const { rows } = await query<{ attendance_rate: number | null }>(
    `select avg(attendance_rate)::float as attendance_rate
       from imm_attendance_rate_by_cohort($1::date, $2::date, $3::uuid[], $4::uuid)` ,
    [fromISO, toISO, projectArray, cohortId],
  );

  const value = rows[0]?.attendance_rate;
  return value === null || value === undefined ? null : Number(value);
}

async function countConsentimentosPendentes(filters: OverviewFilters, fromISO: string, toISO: string): Promise<number> {
  const whereParts = [
    "e.status = 'active'",
    '(e.enrolled_at <= $2)',
    '(e.terminated_at is null or e.terminated_at >= $1)',
  ];
  const values: unknown[] = [fromISO, toISO];
  applyProjectFilters(filters, whereParts, values, 'c.project_id', 'e.cohort_id');

  const sql = `with base as (
         select distinct b.id as beneficiary_id
           from enrollments e
           join cohorts c on c.id = e.cohort_id
           join beneficiaries b on b.id = e.beneficiary_id
          where ${whereParts.join(' and ')}
       )
       select count(distinct base.beneficiary_id) as count
         from base
         left join consents c on c.beneficiary_id = base.beneficiary_id and c.type = 'lgpd'
        where c.id is null or c.granted = false or c.revoked_at is not null`;

  const { rows } = await query<{ count: string }>(sql, values);
  return Number(rows[0]?.count ?? 0);
}

async function fetchSeries(filters: OverviewFilters, fromISO: string, toISO: string, projectArray: string[] | null): Promise<SeriesResponse> {
  const interval = filters.interval ?? 'day';
  const cohortId = filters.cohortId ?? null;

  const [beneficiarias, matriculas, assiduidade] = await Promise.all([
    query<{ bucket_date: string; total: number }>(
      `select bucket_date::text, total
         from imm_series_new_beneficiaries($1::date, $2::date, $3::text, $4::uuid[])`,
      [fromISO, toISO, interval, projectArray],
    ),
    query<{ bucket_date: string; total: number }>(
      `select bucket_date::text, total
         from imm_series_new_enrollments($1::date, $2::date, $3::text, $4::uuid[], $5::uuid)` ,
      [fromISO, toISO, interval, projectArray, cohortId],
    ),
    query<{ bucket_date: string; rate: number | null }>(
      `select bucket_date::text, rate
         from imm_series_attendance($1::date, $2::date, $3::text, $4::uuid[], $5::uuid)` ,
      [fromISO, toISO, interval, projectArray, cohortId],
    ),
  ]);

  return {
    novas_beneficiarias: beneficiarias.rows.map((row) => ({ t: row.bucket_date, v: Number(row.total) })),
    novas_matriculas: matriculas.rows.map((row) => ({ t: row.bucket_date, v: Number(row.total) })),
    assiduidade_media: assiduidade.rows.map((row) => ({ t: row.bucket_date, v: row.rate === null ? null : Number(row.rate) })),
  };
}

async function fetchCategorias(filters: OverviewFilters, fromISO: string, toISO: string, projectArray: string[] | null): Promise<CategoriasResponse> {
  const cohortId = filters.cohortId ?? null;

  const [assiduidadeProjeto, vulnerabilidades, idade, bairros, capacidade, plano] = await Promise.all([
    query<{ project_id: string | null; project_name: string | null; attendance_rate: number | null }>(
      `select p.id as project_id,
              p.name as project_name,
              avg(res.attendance_rate)::float as attendance_rate
         from imm_attendance_rate_by_cohort($1::date, $2::date, $3::uuid[], $4::uuid) res
         left join cohorts c on c.id = res.cohort_id
         left join projects p on p.id = res.project_id
        group by p.id, p.name` ,
      [fromISO, toISO, projectArray, cohortId],
    ),
    query<{ slug: string; label: string; total: number }>('select slug, label, total from view_vulnerabilities_counts'),
    query<{ bucket: string; total: number }>('select bucket, total from imm_age_distribution()'),
    query<{ neighborhood: string; total: number }>('select neighborhood, total from view_neighborhood_counts'),
    query<{ project_id: string; name: string; ocupadas: number; capacidade: number }>(
      `select project_id, name, ocupadas, capacidade
         from view_project_capacity_utilization
        where $1::uuid[] is null or project_id = any($1)` ,
      [projectArray],
    ),
    query<{ status: string; total: number }>('select status, total from view_action_items_status_counts'),
  ]);

  return {
    assiduidade_por_projeto: assiduidadeProjeto.rows
      .filter((row) => row.project_name)
      .map((row) => ({ projeto: row.project_name ?? 'Sem projeto', valor: row.attendance_rate === null ? null : Number(row.attendance_rate) })),
    vulnerabilidades: vulnerabilidades.rows.map((row) => ({ tipo: row.slug, qtd: Number(row.total) })),
    faixa_etaria: idade.rows.map((row) => ({ faixa: row.bucket, qtd: Number(row.total) })),
    bairros: bairros.rows.map((row) => ({ bairro: row.neighborhood, qtd: Number(row.total) })),
    capacidade_projeto: capacidade.rows.map((row) => ({ projeto: row.name, ocupadas: Number(row.ocupadas ?? 0), capacidade: Number(row.capacidade ?? 0) })),
    plano_acao_status: plano.rows.map((row) => ({ status: row.status, qtd: Number(row.total) })),
  };
}

async function fetchListas(filters: OverviewFilters, fromISO: string, toISO: string, projectArray: string[] | null): Promise<ListasResponse> {
  const cohortId = filters.cohortId ?? null;

  const risco = await query<{
    enrollment_id: string;
    attendance_rate: number | null;
    full_name: string;
    project_name: string;
    cohort_code: string | null;
  }>(
    `select sub.enrollment_id,
            sub.attendance_rate,
            b.full_name,
            p.name as project_name,
            c.code as cohort_code
       from (
         select * from imm_attendance_rate_by_enrollment($1::date, $2::date, $3::uuid[], $4::uuid)
       ) sub
       join enrollments e on e.id = sub.enrollment_id
       join beneficiaries b on b.id = e.beneficiary_id
       join cohorts c on c.id = e.cohort_id
       join projects p on p.id = c.project_id
      where sub.attendance_rate is not null
      order by sub.attendance_rate asc
      limit 10`,
    [fromISO, toISO, projectArray, cohortId],
  );

  const consentWhere = [
    "e.status = 'active'",
    '(e.enrolled_at <= $2)',
    '(e.terminated_at is null or e.terminated_at >= $1)',
  ];
  const consentValues: unknown[] = [fromISO, toISO];
  applyProjectFilters(filters, consentWhere, consentValues, 'c.project_id', 'e.cohort_id');

  const consentimentos = await query<{
    beneficiary_id: string;
    full_name: string;
    tipo: string;
    desde: string | null;
  }>(
    `with base as (
         select distinct b.id as beneficiary_id, b.full_name
           from enrollments e
           join cohorts c on c.id = e.cohort_id
           join beneficiaries b on b.id = e.beneficiary_id
          where ${consentWhere.join(' and ')}
       )
       select base.beneficiary_id,
              base.full_name,
              'lgpd' as tipo,
              c.granted_at as desde
         from base
         left join consents c on c.beneficiary_id = base.beneficiary_id and c.type = 'lgpd'
        where c.id is null or c.granted = false or c.revoked_at is not null`,
    consentValues,
  );

  return {
    risco_evasao: risco.rows.map((row) => ({
      beneficiaria: row.full_name,
      projeto: row.project_name,
      turma: row.cohort_code ?? '',
      assiduidade: row.attendance_rate === null ? null : Number(row.attendance_rate),
    })),
    consentimentos_pendentes: consentimentos.rows.map((row) => ({
      beneficiaria: row.full_name,
      tipo: row.tipo,
      desde: row.desde ?? fromISO,
    })),
  };
}
