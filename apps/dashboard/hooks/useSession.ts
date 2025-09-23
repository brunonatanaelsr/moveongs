'use client';

import { useEffect, useState } from 'react';

export type Session = {
  token: string;
  permissions: string[];
  roles: string[];
};

const STORAGE_KEY = 'imm:session';

type StoredSession = {
  token?: string;
  permissions?: string[];
  roles?: string[];
};

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as StoredSession;
      if (parsed.token) {
        setSession({
          token: parsed.token,
          permissions: parsed.permissions ?? [],
          roles: parsed.roles ?? [],
        });
      }
    } catch (error) {
      console.warn('Failed to parse stored session', error);
    }
  }, []);

  return session;
}
