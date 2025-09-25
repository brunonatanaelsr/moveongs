'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Shell } from '../../components/Shell';
import { PrimarySidebar } from '../../components/PrimarySidebar';
import { useRequirePermission } from '../../hooks/useRequirePermission';
import { Card } from '../../components/ui/card';
import { FORM_SCHEMAS } from '../../lib/forms/schemas';

export default function FormsCatalogPage() {
  const session = useRequirePermission('forms:submit');
  const primarySidebar = useMemo(() => (session ? <PrimarySidebar session={session} /> : null), [session]);

  if (session === undefined) {
    return null;
  }

  return (
    <Shell
      title="Formulários institucionais"
      description="Renderize os formulários oficiais do IMM a partir dos schemas JSON versionados."
      sidebar={primarySidebar}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {FORM_SCHEMAS.map((form) => (
          <Link key={form.slug} href={`/forms/${form.slug}`} className="block">
            <Card className="space-y-3 p-6 transition hover:border-emerald-400/40 hover:bg-emerald-500/10">
              <h2 className="text-lg font-semibold text-white">{form.title}</h2>
              <p className="text-sm text-white/70">{form.description}</p>
              <div className="text-[11px] uppercase tracking-[0.22em] text-white/40">
                Permissões sugeridas: {form.recommendedPermissions.join(' • ')}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </Shell>
  );
}
