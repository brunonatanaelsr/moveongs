import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SESSION_EVENT,
  SESSION_STORAGE_KEY,
  clearSession,
  loadSession,
  saveSession,
  type StoredSession,
} from '../lib/session';

describe('session storage helpers', () => {
  const session: StoredSession = {
    token: 'token',
    refreshToken: 'refresh',
    refreshTokenExpiresAt: '2099-01-01T00:00:00.000Z',
    permissions: ['analytics:read'],
    roles: ['admin'],
    projectScopes: ['project-1'],
    user: {
      id: 'user-1',
      name: 'Ana',
      email: 'ana@example.com',
    },
  };

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('persists the session and dispatches an event', () => {
    const listener = vi.fn();
    window.addEventListener(SESSION_EVENT, (event) => listener((event as CustomEvent<StoredSession>).detail));

    saveSession(session);

    expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBe(JSON.stringify(session));
    expect(listener).toHaveBeenCalledWith(session);
  });

  it('loads the stored session when available', () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));

    expect(loadSession()).toEqual(session);
  });

  it('clears the session and notifies listeners', () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    const listener = vi.fn();
    window.addEventListener(SESSION_EVENT, (event) => listener((event as CustomEvent<StoredSession | null>).detail));

    clearSession();

    expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(listener).toHaveBeenCalledWith(null);
  });
});
