'use client';

import { useState } from 'react';
import type { Filters } from '../types/analytics';

const todayISO = new Date().toISOString().slice(0, 10);
const thirtyDaysAgoISO = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);

export function useDashboardFilters(initial?: Filters) {
  const [filters, setFilters] = useState<Filters>({
    from: initial?.from ?? thirtyDaysAgoISO,
    to: initial?.to ?? todayISO,
    projectId: initial?.projectId,
    cohortId: initial?.cohortId,
  });

  function update(partial: Partial<Filters>) {
    setFilters((prev) => ({ ...prev, ...partial }));
  }

  function reset() {
    setFilters({ from: thirtyDaysAgoISO, to: todayISO });
  }

  return { filters, update, reset };
}
