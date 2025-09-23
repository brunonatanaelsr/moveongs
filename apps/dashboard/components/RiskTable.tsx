'use client';

import clsx from 'clsx';
import { formatPercent } from '../utils/format';

interface RiskTableProps {
  data: Array<{ beneficiaria: string; projeto: string; turma: string; assiduidade: number | null }>;
}

export function RiskTable({ data }: RiskTableProps) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-black/20 backdrop-blur-3xl">
      <h3 className="text-lg font-semibold text-white">Risco de evasão</h3>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-sm text-white/80">
          <thead className="uppercase text-xs text-white/50">
            <tr>
              <th className="pb-2">Beneficiária</th>
              <th className="pb-2">Projeto</th>
              <th className="pb-2">Turma</th>
              <th className="pb-2 text-right">Assiduidade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {data.map((item) => {
              const value = item.assiduidade;
              const isRisk = value !== null && value < 0.75;
              return (
                <tr key={`${item.beneficiaria}-${item.turma}`} className="hover:bg-white/5">
                  <td className="py-2 font-medium text-white">{item.beneficiaria}</td>
                  <td className="py-2">{item.projeto}</td>
                  <td className="py-2">{item.turma}</td>
                  <td className="py-2 text-right">
                    <span
                      className={clsx('inline-flex items-center gap-2 rounded-full px-2 py-1 text-xs font-semibold', {
                        'bg-rose-500/20 text-rose-200': isRisk,
                        'bg-white/10 text-white': !isRisk,
                      })}
                    >
                      {formatPercent(value)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
