'use client';

import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar } from 'recharts';
import { formatPercent } from '../utils/format';

interface CategoryBarChartProps {
  title: string;
  data: Array<{ label: string; value: number | null }>;
  valueType?: 'count' | 'percent';
}

export function CategoryBarChart({ title, data, valueType = 'count' }: CategoryBarChartProps) {
  const chartData = data.map((item) => ({
    label: item.label,
    value: valueType === 'percent' && item.value != null ? Number(item.value) * 100 : item.value,
  }));

  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-black/20 backdrop-blur-3xl">
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <div className="mt-4 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis
              type="number"
              stroke="#cbd5f5"
              tick={{ fontSize: 12, fill: '#cbd5f5' }}
              tickFormatter={(value) => (valueType === 'percent' ? `${value?.toFixed(1)}%` : value)}
            />
            <YAxis type="category" dataKey="label" width={150} stroke="#cbd5f5" tick={{ fontSize: 12, fill: '#cbd5f5' }} />
            <Tooltip
              contentStyle={{ backgroundColor: 'rgba(15,23,42,0.9)', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.1)' }}
              labelStyle={{ color: '#e2e8f0' }}
              formatter={(value: number | null) =>
                valueType === 'percent' ? formatPercent((value ?? 0) / 100) : value?.toString() ?? ''
              }
            />
            <Bar dataKey="value" radius={[8, 8, 8, 8]} fill="#22d3ee" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
