'use client';

export const SESSION_STORAGE_KEY = 'imm:session';
export const SESSION_EVENT = 'imm:session-changed';

export type SessionUser = {
  id: string;
  name: string;
  email: string;
};

export type Session = {
  token: string;
  refreshToken: string | null;
  refreshTokenExpiresAt: string | null;
  permissions: string[];
  roles: string[];
  projectScopes: string[];
  user: SessionUser;
};

export type StoredSession = Session;

function isValidSession(value: unknown): value is StoredSession {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const session = value as Partial<StoredSession>;
  return (
    typeof session.token === 'string' &&
    Array.isArray(session.permissions) &&
    Array.isArray(session.roles) &&
    typeof session.user === 'object' &&
    session.user !== null &&
    typeof session.user.id === 'string' &&
    typeof session.user.name === 'string' &&
    typeof session.user.email === 'string'
  );
}

export function loadSession(): StoredSession | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isValidSession(parsed)) {
      return parsed;
    }
  } catch (error) {
    console.warn('Failed to parse stored session', error);
  }

  return null;
}

export function saveSession(session: StoredSession) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  window.dispatchEvent(new CustomEvent<StoredSession>(SESSION_EVENT, { detail: session }));
}

export function clearSession() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent<StoredSession | null>(SESSION_EVENT, { detail: null }));
}
