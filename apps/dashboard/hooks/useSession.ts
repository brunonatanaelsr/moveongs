'use client';

import { useEffect, useState } from 'react';
import { SESSION_EVENT, SESSION_STORAGE_KEY, type Session, loadSession } from '../lib/session';

export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    setSession(loadSession());

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== SESSION_STORAGE_KEY) {
        return;
      }
      setSession(loadSession());
    };

    const handleSessionEvent = (event: Event) => {
      const custom = event as CustomEvent<Session | null>;
      if (custom.detail !== undefined) {
        setSession(custom.detail);
      } else {
        setSession(loadSession());
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(SESSION_EVENT, handleSessionEvent as EventListener);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(SESSION_EVENT, handleSessionEvent as EventListener);
    };
  }, []);

  return session;
}
