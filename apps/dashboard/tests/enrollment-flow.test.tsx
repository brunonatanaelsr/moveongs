import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import React from 'react';
import EnrollmentsPage from '../app/enrollments/page';
import { server } from './msw/server';

const API_URL = 'http://localhost:3333';

const mockSession = {
  token: 'token',
  refreshToken: 'refresh',
  refreshTokenExpiresAt: '2024-01-01T00:00:00.000Z',
  permissions: ['enrollments:create'],
  roles: ['admin'],
  projectScopes: [],
  user: { id: '1', name: 'Admin', email: 'admin@example.com' },
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/enrollments',
}));

vi.mock('../hooks/useRequirePermission', () => ({
  useRequirePermission: vi.fn(() => mockSession),
}));

vi.mock('../hooks/useSession', () => ({
  useSession: vi.fn(() => mockSession),
}));

describe('EnrollmentsPage integration', () => {
  let mockEnrollments: EnrollmentResponse[];

  beforeEach(() => {
    mockEnrollments = [];
    server.use(
      http.get(`${API_URL}/projects`, () =>
        HttpResponse.json({
          data: [
            {
              id: 'project-1',
              name: 'Projeto Teste',
              description: 'Descrição do projeto',
              focus: 'Educação',
              cohorts: [],
              capacity: 20,
              activeEnrollments: 5,
              riskAlerts: 1,
              attendanceRate: 0.8,
            },
          ],
        }),
      ),
      http.get(`${API_URL}/projects/project-1/cohorts`, () =>
        HttpResponse.json({
          data: [
            { id: 'cohort-1', name: 'Turma A', schedule: 'Manhã', capacity: 10, location: 'Sede', educator: 'Equipe' },
          ],
        }),
      ),
      http.get(`${API_URL}/enrollments`, ({ request }) => {
        const projectId = new URL(request.url).searchParams.get('projectId');
        if (projectId === 'project-1') {
          return HttpResponse.json({ data: mockEnrollments });
        }
        return HttpResponse.json({ data: [] });
      }),
      http.post(`${API_URL}/enrollments`, async ({ request }) => {
        const body = await request.json();
        const enrollment: EnrollmentResponse = {
          id: 'enrollment-api',
          projectId: body.projectId,
          cohortId: body.cohortId,
          startDate: body.startDate ?? new Date().toISOString().slice(0, 10),
          status: 'pendente',
          agreementsAccepted: true,
          beneficiary: {
            id: body.beneficiary.id,
            name: body.beneficiary.name,
          },
        };
        mockEnrollments.push(enrollment);
        return HttpResponse.json({ data: enrollment });
      }),
    );
  });

  it('submits a new enrollment and shows it in the table', async () => {
    const user = userEvent.setup();
    render(<EnrollmentsPage />);

    await screen.findByLabelText('Nome da beneficiária');
    await waitFor(() => {
      const select = screen.getByLabelText('Projeto') as HTMLSelectElement;
      return select.options.length > 0;
    });
    await waitFor(() => {
      const select = screen.getByLabelText('Turma') as HTMLSelectElement;
      return select.options.length > 0;
    });
    await user.selectOptions(screen.getByLabelText('Turma'), 'cohort-1');

    await user.type(screen.getByLabelText('Nome da beneficiária'), 'Ana Teste');
    await user.type(screen.getByLabelText('Contato telefônico'), '(11) 98888-0000');

    await user.click(screen.getByRole('button', { name: 'Registrar inscrição' }));

    await waitFor(() => expect(mockEnrollments).toHaveLength(1));
    await waitFor(() =>
      expect(screen.getByText('Inscrição registrada e enviada para a API.')).toBeInTheDocument(),
    );

    await screen.findByText('Ana Teste');
  });
});

type EnrollmentResponse = {
  id: string;
  projectId: string;
  cohortId: string;
  startDate: string;
  status: 'pendente' | 'ativa';
  agreementsAccepted: boolean;
  beneficiary: { id: string; name: string };
};
