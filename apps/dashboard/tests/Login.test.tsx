import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import LoginPage from '../app/(auth)/login/page';

const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

const loginMock = vi.fn();
const mapSessionMock = vi.fn();
const saveSessionMock = vi.fn();

vi.mock('../lib/auth', () => ({
  login: (...args: unknown[]) => loginMock(...args),
  mapLoginResponseToSession: (...args: unknown[]) => mapSessionMock(...args),
}));

vi.mock('../lib/session', () => ({
  saveSession: (...args: unknown[]) => saveSessionMock(...args),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    loginMock.mockReset();
    mapSessionMock.mockReset();
    saveSessionMock.mockReset();
    replaceMock.mockReset();
  });

  it('shows validation error when fields are empty', async () => {
    render(<LoginPage />);

    fireEvent.submit(screen.getByRole('button', { name: 'Entrar' }).closest('form')!);

    expect(await screen.findByText('Informe e-mail e senha para continuar.')).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('renders MFA message when challenge is required', async () => {
    loginMock.mockResolvedValue({
      mfaRequired: true,
      challengeId: 'challenge',
      methods: ['totp', 'webauthn'],
      expiresAt: new Date().toISOString(),
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('E-mail institucional'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'secret' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Entrar' }).closest('form')!);

    expect(await screen.findByText('Verificação adicional necessária')).toBeInTheDocument();
    expect(saveSessionMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('saves session and redirects on success', async () => {
    loginMock.mockResolvedValue({ token: 'token' });
    const session = { token: 'token', permissions: [], roles: [], projectScopes: [], user: { id: '1', name: 'Ana', email: 'ana@example.com' }, refreshToken: 'refresh', refreshTokenExpiresAt: '2024-01-01T00:00:00.000Z' };
    mapSessionMock.mockReturnValue(session);

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('E-mail institucional'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'secret' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Entrar' }).closest('form')!);

    await waitFor(() => {
      expect(saveSessionMock).toHaveBeenCalledWith(session);
    });
    expect(replaceMock).toHaveBeenCalledWith('/');
  });
});
