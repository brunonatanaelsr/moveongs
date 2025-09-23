'use client';

import {
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Line,
  ResponsiveContainer,
} from 'recharts';
import type { TimeseriesPoint } from '../types/analytics';
import { formatPercent } from '../utils/format';

interface TimeSeriesChartProps {
  title: string;
  data: TimeseriesPoint[];
  valueType?: 'count' | 'percent';
}

export function TimeSeriesChart({ title, data, valueType = 'count' }: TimeSeriesChartProps) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-black/20 backdrop-blur-3xl">
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis dataKey="t" stroke="#cbd5f5" tick={{ fontSize: 12, fill: '#cbd5f5' }} interval="preserveStartEnd" />
            <YAxis
              stroke="#cbd5f5"
              tick={{ fontSize: 12, fill: '#cbd5f5' }}
              tickFormatter={(value) => (valueType === 'percent' ? formatPercent(Number(value)) : String(value ?? ''))}
              domain={valueType === 'percent' ? [0, 1] : ['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{ backgroundColor: 'rgba(15,23,42,0.9)', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.1)' }}
              labelStyle={{ color: '#e2e8f0' }}
              formatter={(value: number | null) =>
                valueType === 'percent' ? formatPercent(value ?? 0) : value?.toString() ?? ''
              }
            />
            <Line type="monotone" dataKey="v" stroke="#38bdf8" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
