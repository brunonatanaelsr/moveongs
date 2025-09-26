import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import ActionPlansPage from '../app/action-plans/page';

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
    permissions: ['action_plans:read', 'action_plans:update', 'action_plans:create'],
    roles: ['admin'],
    projectScopes: [],
    user: { id: '1', name: 'Admin', email: 'admin@example.com' },
  })),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
}));

const { createActionPlanMock, createActionPlanItemMock, updateActionPlanItemMock } = vi.hoisted(() => ({
  createActionPlanMock: vi.fn(),
  createActionPlanItemMock: vi.fn(),
  updateActionPlanItemMock: vi.fn(),
}));

vi.mock('../lib/operations', async () => {
  const actual = await vi.importActual<typeof import('../lib/operations')>('../lib/operations');
  return {
    ...actual,
    createActionPlan: createActionPlanMock,
    createActionPlanItem: createActionPlanItemMock,
    updateActionPlanItem: updateActionPlanItemMock,
  };
});

describe('ActionPlansPage', () => {
  beforeEach(() => {
    swrDataMap.clear();
    swrMutateMap.clear();
    createActionPlanMock.mockResolvedValue({});
    createActionPlanItemMock.mockResolvedValue({});
    updateActionPlanItemMock.mockResolvedValue({});

    swrDataMap.set('beneficiaries:list', {
      data: [
        {
          id: 'b1',
          code: '001',
          fullName: 'Ana Silva',
          birthDate: null,
          cpf: null,
          phone1: null,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          vulnerabilities: [],
        },
      ],
      meta: { limit: 50, offset: 0, count: 1 },
    });

    swrDataMap.set('action-plans:list', [
      {
        id: 'plan1',
        beneficiaryId: 'b1',
        status: 'active',
        createdBy: null,
        createdAt: '2024-01-10T00:00:00.000Z',
        updatedAt: '2024-01-12T00:00:00.000Z',
        items: [
          {
            id: 'task1',
            actionPlanId: 'plan1',
            title: 'Atualizar currículo',
            responsible: 'Equipe IMM',
            dueDate: '2024-06-01',
            status: 'pending',
            support: null,
            notes: null,
            completedAt: null,
            createdAt: '2024-01-10T00:00:00.000Z',
            updatedAt: '2024-01-10T00:00:00.000Z',
          },
        ],
      },
    ]);
  });

  it('renders plan data and updates task status', () => {
    render(<ActionPlansPage />);

    expect(screen.getByText('Ana Silva')).toBeInTheDocument();
    expect(screen.getByText('Atualizar currículo')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Em andamento' }));
    expect(updateActionPlanItemMock).toHaveBeenCalledWith(
      'plan1',
      'task1',
      { status: 'in_progress', completedAt: null },
      'token',
    );
  });

  it('allows creating a new action item', () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Nova ação');
    render(<ActionPlansPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar ação' }));

    expect(createActionPlanItemMock).toHaveBeenCalledWith(
      'plan1',
      expect.objectContaining({ title: 'Nova ação', status: 'pending' }),
      'token',
    );

    promptSpy.mockRestore();
  });
});
