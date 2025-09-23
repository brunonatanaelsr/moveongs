'use client';

import useSWR from 'swr';
import type { Filters, OverviewResponse, TimeseriesMetric, TimeseriesPoint } from '../types/analytics';
import { fetchJson } from '../lib/api';
import { useSession } from './useSession';

export function useAnalyticsOverview(filters: Filters) {
  const session = useSession();
  const key = session ? ['analytics-overview', filters, session.token] : null;
  const { data, error, isLoading, mutate } = useSWR<OverviewResponse>(key, ([, params, token]) =>
    fetchJson('/analytics/overview', params, token),
  );

  return {
    overview: data,
    error,
    isLoading,
    mutate,
  };
}

export function useAnalyticsTimeseries(metric: TimeseriesMetric, filters: Filters) {
  const session = useSession();
  const key = session ? ['analytics-series', metric, filters, session.token] : null;
  const { data, error } = useSWR<TimeseriesPoint[]>(key, ([, metricName, params, token]) =>
    fetchJson('/analytics/timeseries', { ...params, metric: metricName }, token).then((res) => res.data as TimeseriesPoint[]),
  );

  return {
    points: data ?? [],
    error,
    isLoading: !data && !error,
  };
}
