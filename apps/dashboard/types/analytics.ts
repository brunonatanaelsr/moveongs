export type Kpis = {
  beneficiarias_ativas: number;
  novas_beneficiarias: number;
  matriculas_ativas: number;
  assiduidade_media: number | null;
  consentimentos_pendentes: number;
};

export type TimePoint = { t: string; v: number };
export type TimePointNullable = { t: string; v: number | null };

export type Series = {
  novas_beneficiarias: TimePoint[];
  novas_matriculas: TimePoint[];
  assiduidade_media: TimePointNullable[];
};

export type Categorias = {
  assiduidade_por_projeto: Array<{ projeto: string; valor: number | null }>;
  vulnerabilidades: Array<{ tipo: string; qtd: number }>;
  faixa_etaria: Array<{ faixa: string; qtd: number }>;
  bairros: Array<{ bairro: string; qtd: number }>;
  capacidade_projeto: Array<{ projeto: string; ocupadas: number; capacidade: number }>;
  plano_acao_status: Array<{ status: string; qtd: number }>;
};

export type Listas = {
  risco_evasao: Array<{ beneficiaria: string; projeto: string; turma: string; assiduidade: number | null }>;
  consentimentos_pendentes: Array<{ beneficiaria: string; tipo: string; desde: string }>;
};

export type OverviewResponse = {
  kpis: Kpis;
  series: Series;
  categorias: Categorias;
  listas: Listas;
};

export type Filters = {
  from?: string;
  to?: string;
  projectId?: string;
  cohortId?: string;
};

export type TimeseriesMetric = 'beneficiarias' | 'matriculas' | 'assiduidade';
export type TimeseriesPoint = { t: string; v: number | null };
