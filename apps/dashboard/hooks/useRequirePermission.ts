'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from './useSession';

export function useRequirePermission(required: string | string[]) {
  const session = useSession();
  const router = useRouter();
  const requirements = Array.isArray(required) ? required : [required];

  useEffect(() => {
    if (!session) {
      return;
    }

    const allowed = requirements.some((perm) => session.permissions.includes(perm));
    if (!allowed) {
      router.replace('/403');
    }
  }, [requirements, router, session]);

  return session;
}
