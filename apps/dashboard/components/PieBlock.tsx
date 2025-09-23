'use client';

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';

interface PieBlockProps {
  title: string;
  data: Array<{ label: string; value: number }>;
}

const COLORS = ['#22d3ee', '#8b5cf6', '#34d399', '#f472b6', '#f97316', '#38bdf8', '#c084fc'];

export function PieBlock({ title, data }: PieBlockProps) {
  const pieData = data.map((item) => ({ name: item.label, value: item.value }));

  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-black/20 backdrop-blur-3xl">
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <div className="mt-4 h-72">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={4}>
              {pieData.map((entry, index) => (
                <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ backgroundColor: 'rgba(15,23,42,0.9)', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.1)' }}
            />
            <Legend verticalAlign="bottom" height={36} wrapperStyle={{ color: '#e2e8f0' }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
