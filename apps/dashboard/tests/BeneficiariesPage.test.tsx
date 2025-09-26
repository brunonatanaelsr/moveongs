import { render, screen } from '@testing-library/react';
import React from 'react';
import BeneficiariesPage from '../app/beneficiaries/page';

const swrDataMap = new Map<string, unknown>();

vi.mock('swr', () => ({
  __esModule: true,
  default: (key: any) => {
    if (!key) {
      return { data: undefined, error: undefined, isLoading: false, mutate: vi.fn() };
    }
    const mapKey = Array.isArray(key) ? key[0] : key;
    const data = swrDataMap.get(mapKey);
    return { data, error: undefined, isLoading: false, mutate: vi.fn() };
  },
}));

vi.mock('../hooks/useRequirePermission', () => ({
  useRequirePermission: vi.fn(() => ({
    token: 'token',
    refreshToken: 'refresh',
    refreshTokenExpiresAt: '2024-01-01T00:00:00.000Z',
    permissions: ['beneficiaries:read'],
    roles: ['admin'],
    projectScopes: [],
    user: { id: '1', name: 'Admin', email: 'admin@example.com' },
  })),
}));

const { submitBeneficiaryFormMock } = vi.hoisted(() => ({
  submitBeneficiaryFormMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
}));

vi.mock('../lib/operations', async () => {
  const actual = await vi.importActual<typeof import('../lib/operations')>('../lib/operations');
  return {
    ...actual,
    submitBeneficiaryForm: submitBeneficiaryFormMock,
  };
});

describe('BeneficiariesPage', () => {
  beforeEach(() => {
    submitBeneficiaryFormMock.mockResolvedValue({ id: 'sub-1' });
    swrDataMap.clear();
    swrDataMap.set('beneficiaries:list', {
      data: [
        {
          id: 'b1',
          fullName: 'Ana Maria',
          code: '001',
          birthDate: '1990-01-01',
          cpf: '123',
          phone1: '99999',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          vulnerabilities: ['desemprego'],
        },
      ],
    });
    swrDataMap.set('beneficiaries:detail', {
      id: 'b1',
      fullName: 'Ana Maria',
      code: '001',
      birthDate: '1990-01-01',
      cpf: '123',
      rg: null,
      rgIssuer: null,
      rgIssueDate: null,
      nis: null,
      phone1: '9999',
      phone2: null,
      email: 'ana@example.com',
      address: 'Rua A',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      reference: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      householdMembers: [],
      vulnerabilities: [{ slug: 'desemprego', label: 'Desemprego' }],
    });
    swrDataMap.set('beneficiaries:forms', { data: [] });
    swrDataMap.set('beneficiaries:timeline', {
      data: [
        {
          id: 't1',
          beneficiaryId: 'b1',
          kind: 'formulario',
          date: '2024-01-10T00:00:00.000Z',
          title: 'Formulário enviado',
          description: 'Descrição do evento',
        },
      ],
    });
    swrDataMap.set('beneficiaries:consents', [
      {
        id: 'c1',
        beneficiaryId: 'b1',
        type: 'lgpd',
        textVersion: '1',
        granted: true,
        grantedAt: '2024-01-05T00:00:00.000Z',
        revokedAt: null,
        evidence: null,
        createdAt: '2024-01-05T00:00:00.000Z',
        updatedAt: '2024-01-05T00:00:00.000Z',
      },
    ]);
  });

  it('renders beneficiary profile and timeline', async () => {
    render(<BeneficiariesPage />);

    expect(screen.getByRole('heading', { level: 2, name: 'Ana Maria' })).toBeInTheDocument();
    expect(screen.getByText('Desemprego')).toBeInTheDocument();
  });
});
