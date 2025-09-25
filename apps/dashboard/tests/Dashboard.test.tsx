import { render, screen } from '@testing-library/react';
import React from 'react';
import DashboardPage from '../app/page';

const mockSession = {
  token: 'token',
  refreshToken: 'refresh',
  refreshTokenExpiresAt: '2024-01-01T00:00:00.000Z',
  permissions: ['analytics:read'],
  roles: ['admin'],
  projectScopes: [],
  user: { id: '1', name: 'Admin', email: 'admin@example.com' },
};
const overviewMock = {
  kpis: {
    beneficiarias_ativas: 42,
    novas_beneficiarias: 5,
    matriculas_ativas: 18,
    assiduidade_media: 0.82,
    consentimentos_pendentes: 3,
  },
  series: {
    novas_beneficiarias: [{ t: '2024-06-01', v: 2 }],
    novas_matriculas: [{ t: '2024-06-01', v: 3 }],
    assiduidade_media: [{ t: '2024-06-01', v: 0.82 }],
  },
  categorias: {
    assiduidade_por_projeto: [{ projeto: 'Projeto A', valor: 0.8 }],
    vulnerabilidades: [{ tipo: 'desemprego', qtd: 10 }],
    faixa_etaria: [{ faixa: '18-24', qtd: 7 }],
    bairros: [{ bairro: 'Centro', qtd: 5 }],
    capacidade_projeto: [{ projeto: 'Projeto A', ocupadas: 12, capacidade: 20 }],
    plano_acao_status: [{ status: 'pending', qtd: 4 }],
  },
  listas: {
    risco_evasao: [{ beneficiaria: 'Ana', projeto: 'Projeto A', turma: 'Manhã', assiduidade: 0.6 }],
    consentimentos_pendentes: [{ beneficiaria: 'Beatriz', tipo: 'lgpd', desde: '2024-05-01' }],
  },
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
}));

vi.mock('../hooks/useRequirePermission', () => ({
  useRequirePermission: vi.fn(() => mockSession),
}));

vi.mock('../hooks/useDashboardFilters', () => ({
  useDashboardFilters: () => ({
    filters: { from: '2024-05-01', to: '2024-06-01' },
    update: vi.fn(),
    reset: vi.fn(),
  }),
}));

vi.mock('../hooks/useAnalyticsData', () => ({
  useAnalyticsOverview: () => ({ overview: overviewMock, isLoading: false, error: undefined }),
}));

vi.mock('../components/FiltersBar', () => ({
  FiltersBar: () => <div data-testid="filters" />,
}));

vi.mock('../components/TimeSeriesChart', () => ({
  TimeSeriesChart: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('../components/CategoryBarChart', () => ({
  CategoryBarChart: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('../components/PieBlock', () => ({
  PieBlock: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('../components/CapacityUtilization', () => ({
  CapacityUtilization: () => <div>capacidade</div>,
}));

vi.mock('../components/RiskTable', () => ({
  RiskTable: () => <div>risco</div>,
}));

vi.mock('../components/ConsentTable', () => ({
  ConsentTable: () => <div>consentimentos</div>,
}));

vi.mock('../components/ExportButtons', () => ({
  ExportButtons: () => <div>exportar</div>,
}));

describe('DashboardPage', () => {
  it('renders KPIs and sections when data is loaded', () => {
    render(<DashboardPage />);

    expect(screen.getByText('Beneficiárias ativas')).toBeInTheDocument();
    expect(screen.getByText('Novas beneficiárias')).toBeInTheDocument();
    expect(screen.getByText('Assiduidade por projeto')).toBeInTheDocument();
    expect(screen.getByText('risco')).toBeInTheDocument();
    expect(screen.getByText('consentimentos')).toBeInTheDocument();
  });
});
