'use client';

import { useMemo, useState } from 'react';
import { Shell } from '../../components/Shell';
import { PrimarySidebar } from '../../components/PrimarySidebar';
import { useRequirePermission } from '../../hooks/useRequirePermission';
import { JsonSchemaForm } from '../../components/forms/JsonSchemaForm';
import { FORM_SCHEMA_MAP } from '../../lib/forms/schemas';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { BENEFICIARIES } from '../../data/mockOperations';

const steps = [
  {
    id: 'cadastro',
    title: 'Cadastro civil e vulnerabilidades',
    description:
      'Coleta dados civis, composição familiar e vulnerabilidades para definir elegibilidade e prioridades de atendimento.',
    formSlug: 'anamnese-social',
  },
  {
    id: 'inscricao',
    title: 'Inscrição no projeto',
    description:
      'Seleciona turma, registra aceite dos acordos de convivência e vincula a beneficiária ao projeto adequado.',
    formSlug: 'inscricao-projeto',
  },
  {
    id: 'consentimento',
    title: 'Consentimentos obrigatórios',
    description:
      'Registra autorização LGPD e uso de imagem com canal de revogação e trilha auditável.',
    formSlug: 'consentimento-lgpd',
  },
  {
    id: 'resumo',
    title: 'Resumo e próximos passos',
    description:
      'Valide as informações coletadas, identifique pendências e finalize a jornada de onboarding.',
    formSlug: null,
  },
] as const;

type StepId = (typeof steps)[number]['id'];

type CollectedData = Partial<Record<Exclude<StepId, 'resumo'>, unknown>>;

export default function OnboardingPage() {
  const session = useRequirePermission([
    'beneficiaries:create',
    'forms:submit',
    'consents:write',
    'enrollments:create',
  ]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [data, setData] = useState<CollectedData>({});

  const activeStep = steps[activeIndex];
  const primarySidebar = useMemo(() => (session ? <PrimarySidebar session={session} /> : null), [session]);

  if (session === undefined) {
    return null;
  }

  const handleAdvance = (stepId: StepId, formData: unknown) => {
    if (stepId !== 'resumo') {
      setData((prev) => ({
        ...prev,
        [stepId]: formData,
      }));
    }

    setActiveIndex((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const handleBack = () => {
    setActiveIndex((prev) => Math.max(prev - 1, 0));
  };

  const handleRestart = () => {
    setData({});
    setActiveIndex(0);
  };

  return (
    <Shell
      title="Onboarding de beneficiárias"
      description="Fluxo guiado para triagem, inscrição e consentimentos de novas beneficiárias do Instituto Move Marias."
      sidebar={primarySidebar}
    >
      <StepIndicator activeIndex={activeIndex} data={data} />

      {activeStep.formSlug ? (
        <JsonSchemaForm
          key={activeStep.id}
          schema={FORM_SCHEMA_MAP[activeStep.formSlug].schema}
          uiSchema={FORM_SCHEMA_MAP[activeStep.formSlug].uiSchema}
          title={FORM_SCHEMA_MAP[activeStep.formSlug].title}
          description={activeStep.description}
          primaryActionLabel={activeIndex === steps.length - 2 ? 'Avançar para resumo' : 'Salvar e avançar'}
          secondaryActionLabel={activeIndex > 0 ? 'Voltar' : undefined}
          onSecondaryAction={activeIndex > 0 ? handleBack : undefined}
          onSubmit={async (formData) => handleAdvance(activeStep.id, formData)}
        />
      ) : (
        <SummaryCard data={data} onRestart={handleRestart} />
      )}
    </Shell>
  );
}

interface StepIndicatorProps {
  activeIndex: number;
  data: CollectedData;
}

function StepIndicator({ activeIndex, data }: StepIndicatorProps) {
  return (
    <Card className="space-y-4" padding="lg">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-white/50">Etapas do onboarding</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">Acompanhe a jornada completa</h2>
      </div>
      <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {steps.map((step, index) => {
          const isActive = index === activeIndex;
          const isCompleted = index < activeIndex || (step.id !== 'resumo' && data[step.id as keyof CollectedData]);
          return (
            <li
              key={step.id}
              className={`rounded-3xl border p-4 transition ${
                isActive
                  ? 'border-emerald-400/60 bg-emerald-400/10 shadow-glass'
                  : isCompleted
                    ? 'border-white/20 bg-white/10'
                    : 'border-white/10 bg-white/5'
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-1 flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                    isCompleted ? 'bg-emerald-400/30 text-emerald-100' : 'bg-white/10 text-white/70'
                  }`}
                >
                  {index + 1}
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-white">{step.title}</h3>
                  <p className="mt-1 text-xs text-white/70">{step.description}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

interface SummaryCardProps {
  data: CollectedData;
  onRestart: () => void;
}

function SummaryCard({ data, onRestart }: SummaryCardProps) {
  const upcomingBeneficiary = BENEFICIARIES.find((beneficiary) => beneficiary.status === 'em_triagem');

  return (
    <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
      <Card className="space-y-6">
        <header className="space-y-2">
          <h2 className="text-xl font-semibold text-white">Resumo estruturado</h2>
          <p className="text-sm text-white/70">
            Revise os principais dados coletados antes de concluir o onboarding. As informações abaixo serão sincronizadas com o
            backend ao finalizar o fluxo.
          </p>
        </header>

        <section className="space-y-4 text-sm text-white/80">
          <SummarySection title="Cadastro civil" data={data.cadastro} fallback="Informações ainda não preenchidas." />
          <SummarySection title="Inscrição no projeto" data={data.inscricao} fallback="Selecione um projeto para continuar." />
          <SummarySection title="Consentimentos" data={data.consentimento} fallback="Registre os consentimentos obrigatórios." />
        </section>

        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={onRestart}>
            Reiniciar fluxo
          </Button>
          <Button type="button" variant="secondary">
            Finalizar e enviar ao IMM API
          </Button>
        </div>
      </Card>

      <Card className="space-y-4">
        <header>
          <h3 className="text-lg font-semibold text-white">Próxima beneficiária na fila</h3>
          <p className="text-xs text-white/60">Antecipe a demanda preparando documentação e disponibilidade da equipe.</p>
        </header>
        {upcomingBeneficiary ? (
          <dl className="space-y-3 text-sm text-white/80">
            <div>
              <dt className="text-xs uppercase tracking-[0.24em] text-white/40">Nome</dt>
              <dd className="text-base text-white">{upcomingBeneficiary.name}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.24em] text-white/40">Código</dt>
              <dd>{upcomingBeneficiary.code}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.24em] text-white/40">Vulnerabilidades</dt>
              <dd>{upcomingBeneficiary.vulnerabilities.join(' • ')}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.24em] text-white/40">Último contato</dt>
              <dd>{upcomingBeneficiary.lastInteraction}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-white/60">Nenhuma beneficiária aguardando triagem no momento.</p>
        )}
      </Card>
    </div>
  );
}

interface SummarySectionProps {
  title: string;
  data: unknown;
  fallback: string;
}

function SummarySection({ title, data, fallback }: SummarySectionProps) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/60">{title}</h3>
      {data ? (
        <pre className="whitespace-pre-wrap rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-white/80">
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : (
        <p className="text-xs text-white/50">{fallback}</p>
      )}
    </section>
  );
}
