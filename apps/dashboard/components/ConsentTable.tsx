'use client';

interface ConsentTableProps {
  data: Array<{ beneficiaria: string; tipo: string; desde: string }>;
}

export function ConsentTable({ data }: ConsentTableProps) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-black/20 backdrop-blur-3xl">
      <h3 className="text-lg font-semibold text-white">Consentimentos pendentes / revogados</h3>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-sm text-white/80">
          <thead className="uppercase text-xs text-white/50">
            <tr>
              <th className="pb-2">Beneficiária</th>
              <th className="pb-2">Tipo</th>
              <th className="pb-2">Desde</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {data.map((item) => (
              <tr key={`${item.beneficiaria}-${item.desde}`} className="hover:bg-white/5">
                <td className="py-2 font-medium text-white">{item.beneficiaria}</td>
                <td className="py-2">{item.tipo.toUpperCase()}</td>
                <td className="py-2">{item.desde}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
