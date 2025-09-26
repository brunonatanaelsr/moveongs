import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import ProjectsPage from '../app/projects/page';

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
    permissions: ['projects:read'],
    roles: ['admin'],
    projectScopes: [],
    user: { id: '1', name: 'Admin', email: 'admin@example.com' },
  })),
}));

const { updateEnrollmentMock, recordAttendanceMock } = vi.hoisted(() => ({
  updateEnrollmentMock: vi.fn(),
  recordAttendanceMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
}));

vi.mock('../lib/operations', async () => {
  const actual = await vi.importActual<typeof import('../lib/operations')>('../lib/operations');
  return {
    ...actual,
    updateEnrollment: updateEnrollmentMock,
    recordAttendance: recordAttendanceMock,
  };
});

describe('ProjectsPage', () => {
  beforeEach(() => {
    updateEnrollmentMock.mockResolvedValue({});
    recordAttendanceMock.mockResolvedValue({});
    swrDataMap.clear();
    swrDataMap.set('projects:list', [
      {
        id: 'p1',
        name: 'Projeto Artes',
        description: 'Oficina de artesanato',
        focus: null,
        status: 'ativo',
        capacity: 20,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]);
    swrDataMap.set('projects:cohorts', [
      {
        id: 'c1',
        projectId: 'p1',
        name: 'Turma Manhã',
        schedule: '08h às 10h',
        capacity: 15,
        location: 'Sala 1',
        educator: 'Maria',
      },
    ]);
    swrDataMap.set('projects:enrollments', {
      data: [
        {
          id: 'e1',
          beneficiaryId: 'b1',
          cohortId: 'c1',
          status: 'ativa',
          startDate: '2024-01-05',
          endDate: null,
          disengagementReason: null,
          agreementsAccepted: true,
          createdAt: '2024-01-05T00:00:00.000Z',
          updatedAt: '2024-01-05T00:00:00.000Z',
        },
      ],
    });
  });

  it('renders project information and allows actions', () => {
    render(<ProjectsPage />);

    expect(screen.getAllByText('Projeto Artes')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Turma Manhã')[0]).toBeInTheDocument();
    expect(screen.getAllByText('ativa')[0]).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Desligar' }));
    expect(updateEnrollmentMock).toHaveBeenCalledWith('e1', { status: 'desligada' }, 'token');

    fireEvent.click(screen.getByRole('button', { name: 'Presença' }));
    expect(recordAttendanceMock).toHaveBeenCalled();
  });
});
