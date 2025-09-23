'use client';

import { ResponsiveContainer, ComposedChart, XAxis, YAxis, Tooltip, Legend, Bar } from 'recharts';

interface CapacityUtilizationProps {
  data: Array<{ projeto: string; ocupadas: number; capacidade: number }>;
}

export function CapacityUtilization({ data }: CapacityUtilizationProps) {
  const chartData = data.map((item) => ({ ...item, livre: Math.max(item.capacidade - item.ocupadas, 0) }));

  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-black/20 backdrop-blur-3xl">
      <h3 className="text-lg font-semibold text-white">Capacidade x Ocupação</h3>
      <div className="mt-4 h-72">
        <ResponsiveContainer>
          <ComposedChart data={chartData}>
            <XAxis dataKey="projeto" stroke="#cbd5f5" tick={{ fontSize: 12, fill: '#cbd5f5' }} />
            <YAxis stroke="#cbd5f5" tick={{ fontSize: 12, fill: '#cbd5f5' }} />
            <Tooltip
              contentStyle={{ backgroundColor: 'rgba(15,23,42,0.9)', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.1)' }}
            />
            <Legend wrapperStyle={{ color: '#e2e8f0' }} />
            <Bar dataKey="ocupadas" stackId="a" fill="#22d3ee" radius={[6, 6, 0, 0]} />
            <Bar dataKey="livre" stackId="a" fill="#0f172a" radius={[0, 0, 6, 6]} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
