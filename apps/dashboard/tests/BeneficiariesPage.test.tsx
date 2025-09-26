import { render, screen } from '@testing-library/react';
import { waitFor } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import React from 'react';
import BeneficiariesPage from '../app/beneficiaries/page';

const mockProfiles = [
  {
    id: '1',
    name: 'John Doe',
    email: 'john@example.com',
    status: 'active',
    createdAt: '2023-01-01T00:00:00.000Z',
  },
  {
    id: '2',
    name: 'Jane Smith',
    email: 'jane@example.com',
    status: 'pending',
    createdAt: '2023-01-02T00:00:00.000Z',
  },
];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
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

vi.mock('../hooks/useBeneficiaryProfile', () => ({
  useBeneficiaryProfile: vi.fn(() => ({
    data: mockProfiles,
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
  })),
}));

describe('BeneficiariesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
