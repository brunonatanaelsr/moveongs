import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AttendancePage from '../app/attendance/page';

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
    permissions: ['attendance:write'],
    roles: ['admin'],
    projectScopes: [],
    user: { id: '1', name: 'Admin', email: 'admin@example.com' },
  })),
}));

vi.mock('../lib/api', () => ({
  fetchJson: vi.fn(),
  requestJson: vi.fn(),
  downloadFile: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
}));

const { submitAttendanceRecordsMock } = vi.hoisted(() => ({
  submitAttendanceRecordsMock: vi.fn(),
}));

vi.mock('../lib/operations', async () => {
  const actual = await vi.importActual<typeof import('../lib/operations')>('../lib/operations');
  return {
    ...actual,
    submitAttendanceRecords: submitAttendanceRecordsMock,
  };
});

describe('AttendancePage', () => {
  beforeEach(() => {
    submitAttendanceRecordsMock.mockReset();
    swrDataMap.clear();
    swrDataMap.set('attendance:projects', [
      {
        id: 'p1',
        name: 'Projeto Artes',
        description: 'Oficina de artesanato',
        focus: null,
        status: 'active',
        capacity: 20,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]);
    swrDataMap.set('attendance:cohorts', [
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
    swrDataMap.set('attendance:enrollments', {
      data: [
        {
          id: 'e1',
          beneficiaryId: 'b1',
          cohortId: 'c1',
          status: 'active',
          startDate: '2024-01-05',
          endDate: null,
          disengagementReason: null,
          agreementsAccepted: true,
          createdAt: '2024-01-05T00:00:00.000Z',
          updatedAt: '2024-01-05T00:00:00.000Z',
          beneficiary: {
            id: 'b1',
            code: 'IMM-001',
            fullName: 'Maria Silva',
            birthDate: null,
            cpf: null,
            phone1: null,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
            vulnerabilities: ['Insegurança alimentar'],
          },
        },
      ],
      meta: { limit: 200, offset: 0, count: 1 },
    });
  });

  it('submits attendance records successfully', async () => {
    submitAttendanceRecordsMock.mockResolvedValue({ successes: 1, failures: [] });

    render(<AttendancePage />);

    const presentButton = await screen.findByRole('button', { name: 'Presente' });
    fireEvent.click(presentButton);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar presença' }));

    const today = new Date().toISOString().slice(0, 10);

    await waitFor(() => {
      expect(submitAttendanceRecordsMock).toHaveBeenCalledWith(
        [
          {
            enrollmentId: 'e1',
            beneficiaryId: 'b1',
            status: 'presente',
            justification: undefined,
            date: today,
          },
        ],
        'token',
      );
    });

    expect(screen.getByText('Presenças registradas com sucesso.')).toBeInTheDocument();
  });

  it('shows error message when submission fails', async () => {
    submitAttendanceRecordsMock.mockResolvedValue({ successes: 0, failures: [{ enrollmentId: 'e1', error: new Error('fail') }] });

    render(<AttendancePage />);

    const presentButton = await screen.findByRole('button', { name: 'Presente' });
    fireEvent.click(presentButton);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar presença' }));

    await waitFor(() => {
      expect(submitAttendanceRecordsMock).toHaveBeenCalled();
    });

    expect(screen.getByText('Não foi possível registrar as presenças. Tente novamente.')).toBeInTheDocument();
  });

  it('requires justification for absences', () => {
    render(<AttendancePage />);

    fireEvent.click(screen.getByRole('button', { name: 'Falta justificada' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar presença' }));

    expect(submitAttendanceRecordsMock).not.toHaveBeenCalled();
    expect(screen.getByText('Informe uma justificativa para todas as ausências.')).toBeInTheDocument();
  });
});
