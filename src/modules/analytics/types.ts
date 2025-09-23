export type OverviewFilters = {
  from?: string;
  to?: string;
  projectId?: string;
  cohortId?: string;
  interval?: 'day' | 'week' | 'month';
  allowedProjectIds: string[] | null;
  scopeKey: string;
};
