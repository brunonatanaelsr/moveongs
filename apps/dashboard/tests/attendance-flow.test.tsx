import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import React from 'react';
import AttendancePage from '../app/attendance/page';
import { server } from './msw/server';
import type { AttendanceRecord } from '../types/operations';

const API_URL = 'http://localhost:3333';

const mockSession = {
  token: 'token',
  refreshToken: 'refresh',
  refreshTokenExpiresAt: '2024-01-01T00:00:00.000Z',
  permissions: ['attendance:write'],
  roles: ['admin'],
  projectScopes: [],
  user: { id: '1', name: 'Admin', email: 'admin@example.com' },
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/attendance',
}));

vi.mock('../hooks/useRequirePermission', () => ({
  useRequirePermission: vi.fn(() => mockSession),
}));

vi.mock('../hooks/useSession', () => ({
  useSession: vi.fn(() => mockSession),
}));

describe('AttendancePage integration', () => {
  let attendanceStore: Record<string, AttendanceRecord[]>;
  let updates: AttendanceRecord[];

  beforeEach(() => {
    attendanceStore = { 'enrollment-1': [] };
    updates = [];

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
          return HttpResponse.json({
            data: [
              {
                id: 'enrollment-1',
                projectId: 'project-1',
                cohortId: 'cohort-1',
                startDate: '2024-07-01',
                status: 'ativa',
                agreementsAccepted: true,
                beneficiary: { id: 'beneficiary-1', name: 'Ana Presença' },
              },
            ],
          });
        }
        return HttpResponse.json({ data: [] });
      }),
      http.get(`${API_URL}/enrollments/enrollment-1/attendance`, () =>
        HttpResponse.json({ data: attendanceStore['enrollment-1'] }),
      ),
      http.post(`${API_URL}/enrollments/enrollment-1/attendance`, async ({ request }) => {
        const body = await request.json();
        const record: AttendanceRecord = {
          id: `attendance-${updates.length + 1}`,
          date: body.date,
          status: body.status,
          justification: body.justification,
          recordedBy: mockSession.user.name,
        };
        attendanceStore['enrollment-1'] = [...attendanceStore['enrollment-1'], record];
        updates.push(record);
        return HttpResponse.json({ data: record });
      }),
    );
  });

  it('registers attendance and shows feedback', async () => {
    const user = userEvent.setup();
    render(<AttendancePage />);

    await waitFor(() => {
      const projectSelect = screen.getByLabelText('Projeto') as HTMLSelectElement;
      return projectSelect.options.length > 0;
    });
    await waitFor(() => {
      const cohortSelect = screen.getByLabelText('Turma') as HTMLSelectElement;
      return cohortSelect.options.length > 0;
    });
    await screen.findByText('Ana Presença');

    await user.click(screen.getByRole('button', { name: 'Ausente' }));
    await user.type(screen.getByPlaceholderText('Opcional'), 'Consulta médica');
    await user.click(screen.getByRole('button', { name: 'Salvar presença' }));

    await screen.findByText('Presenças registradas com sucesso.');

    await waitFor(() => {
      expect(updates).toHaveLength(1);
      expect(updates[0].status).toBe('ausente');
    });
  });
});
