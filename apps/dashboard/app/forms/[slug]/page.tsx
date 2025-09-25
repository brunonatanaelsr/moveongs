'use client';

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Shell } from '../../../components/Shell';
import { PrimarySidebar } from '../../../components/PrimarySidebar';
import { useRequirePermission } from '../../../hooks/useRequirePermission';
import { JsonSchemaForm } from '../../../components/forms/JsonSchemaForm';
import { FORM_SCHEMA_MAP } from '../../../lib/forms/schemas';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';

export default function RenderFormPage() {
  const params = useParams<{ slug: string }>();
  const formDefinition = FORM_SCHEMA_MAP[params.slug ?? ''];
  const session = useRequirePermission('forms:submit');
  const router = useRouter();
  const primarySidebar = useMemo(() => (session ? <PrimarySidebar session={session} /> : null), [session]);

  if (session === undefined) {
    return null;
  }

  if (!formDefinition) {
    return (
      <Shell
        title="Formulário não encontrado"
        description="O schema solicitado não está cadastrado. Volte ao catálogo para escolher outro formulário."
        sidebar={primarySidebar}
      >
        <Card className="space-y-4" padding="lg">
          <p className="text-sm text-white/70">Verifique se o slug informado é válido e corresponde a um formulário disponível.</p>
          <Button type="button" onClick={() => router.push('/forms')}>
            Voltar ao catálogo
          </Button>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell
      title={formDefinition.title}
      description={formDefinition.description}
      sidebar={primarySidebar}
    >
      <JsonSchemaForm
        schema={formDefinition.schema}
        uiSchema={formDefinition.uiSchema}
        onSubmit={async (data) => {
          console.log('Form submission', data);
          alert('Dados registrados localmente. Envie para a API /forms para persistir.');
        }}
        primaryActionLabel="Salvar rascunho"
        secondaryActionLabel="Voltar"
        onSecondaryAction={() => router.back()}
      />
    </Shell>
  );
}
