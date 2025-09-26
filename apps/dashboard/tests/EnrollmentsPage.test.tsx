import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import EnrollmentsPage from '../app/enrollments/page';

const swrDataMap = new Map<string, unknown>();
const swrMutateMap = new Map<string, ReturnType<typeof vi.fn>>();

vi.mock('swr', () => ({
  __esModule: true,
  default: (key: any) => {
    if (!key) {
      return { data: undefined, error: undefined, isLoading: false, mutate: vi.fn() };
    }
    const mapKey = Array.isArray(key) ? key[0] : key;
    const data = swrDataMap.get(mapKey);
    const mutate = swrMutateMap.get(mapKey) ?? vi.fn();
    swrMutateMap.set(mapKey, mutate);
    return { data, error: undefined, isLoading: false, mutate };
  },
}));

vi.mock('../hooks/useRequirePermission', () => ({
  useRequirePermission: vi.fn(() => ({
    token: 'token',
    refreshToken: 'refresh',
    refreshTokenExpiresAt: '2024-01-01T00:00:00.000Z',
    permissions: ['enrollments:create:project', 'enrollments:read:project'],
    roles: ['admin'],
    projectScopes: [],
    user: { id: '1', name: 'Admin', email: 'admin@example.com' },
  })),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
}));

const { createEnrollmentMock } = vi.hoisted(() => ({
  createEnrollmentMock: vi.fn(),
}));

vi.mock('../lib/operations', async () => {
  const actual = await vi.importActual<typeof import('../lib/operations')>('../lib/operations');
  return {
    ...actual,
    createEnrollment: createEnrollmentMock,
  };
});

describe('EnrollmentsPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-01T12:00:00Z'));
    swrDataMap.clear();
    swrMutateMap.clear();
    createEnrollmentMock.mockResolvedValue({});

    swrDataMap.set('projects:list', [
      {
        id: 'p1',
        name: 'Projeto Imersão',
        description: 'Formação profissional',
        focus: null,
        status: 'ativo',
        capacity: null,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
        slug: 'imersao',
        active: true,
      },
    ]);

    swrDataMap.set('projects:cohorts', [
      {
        id: 'c1',
        projectId: 'p1',
        code: 'A',
        shift: 'Manhã',
        startTime: '08:00',
        endTime: '10:00',
        capacity: 15,
        location: 'Sala 1',
        educators: [{ id: 'u1', name: 'Maria' }],
      },
    ]);

    swrDataMap.set('beneficiaries:list', {
      data: [
        {
          id: 'b1',
          code: '001',
          fullName: 'Ana Clara',
          birthDate: '1995-01-01',
          cpf: null,
          phone1: null,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          vulnerabilities: [],
        },
      ],
      meta: { limit: 50, offset: 0, count: 1 },
    });

    swrDataMap.set('enrollments:list', {
      data: [
        {
          id: 'en1',
          beneficiaryId: 'b1',
          beneficiaryName: 'Ana Clara',
          cohortId: 'c1',
          cohortCode: 'A',
          status: 'active',
          startDate: '2024-01-10',
          endDate: null,
          disengagementReason: null,
          agreementsAccepted: true,
          createdAt: '2024-01-10T00:00:00.000Z',
          updatedAt: '2024-01-10T00:00:00.000Z',
          projectId: 'p1',
          projectName: 'Projeto Imersão',
          enrolledAt: '2024-01-10',
        },
      ],
      meta: { limit: 10, offset: 0, count: 1 },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders API data and allows creating a new enrollment', () => {
    render(<EnrollmentsPage />);

    expect(screen.getAllByText('Projeto Imersão').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Turma A • Manhã • 08:00 - 10:00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ana Clara').length).toBeGreaterThan(0);
    expect(screen.getByText('Inscrições registradas')).toBeInTheDocument();
    expect(screen.getByText('Turma A')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Beneficiária'), { target: { value: 'b1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar inscrição' }));

    expect(createEnrollmentMock).toHaveBeenCalledWith(
      { beneficiaryId: 'b1', cohortId: 'c1', enrolledAt: '2024-05-01' },
      'token',
    );
  });
});
