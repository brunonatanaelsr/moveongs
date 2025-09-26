'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { Shell } from '../../components/Shell';
import { PrimarySidebar } from '../../components/PrimarySidebar';
import { useRequirePermission } from '../../hooks/useRequirePermission';
import { FormRenderer } from '../../components/FormRenderer';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { LoadingState } from '../../components/LoadingState';
import { FORM_SCHEMAS, type FormSchemaDefinition } from '../../lib/forms/schemas';
import {
  getBeneficiary,
  listBeneficiaries,
  listBeneficiaryConsents,
  listBeneficiaryForms,
  listBeneficiaryTimeline,
  submitBeneficiaryForm,
  type BeneficiaryRecord,
  type BeneficiarySummary,
  type ConsentRecord,
  type FormSubmissionSummary,
  type TimelineEntry,
} from '../../lib/operations';

const FORM_TABS = [
  { id: 'perfil', label: 'Perfil e dados civis' },
  { id: 'formularios', label: 'Formulários oficiais' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'consentimentos', label: 'Consentimentos' },
];

type BeneficiaryListResponse = { data: BeneficiarySummary[] };

export default function BeneficiariesPage() {
  const session = useRequirePermission(['beneficiaries:read', 'beneficiaries:update']);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('perfil');
  const [activeSchema, setActiveSchema] = useState<FormSchemaDefinition | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const listKey = useMemo(() => {
    if (!session) return null;
    return ['beneficiaries:list', search, session.token] as const;
  }, [session, search]);

  const {
    data: listData,
    error: listError,
    isLoading: loadingList,
  } = useSWR<BeneficiaryListResponse>(listKey, ([, term, token]) => listBeneficiaries({ search: term, limit: 50 }, token));

  useEffect(() => {
    if (!selectedId && listData?.data?.length) {
      setSelectedId(listData.data[0].id);
    }
  }, [listData, selectedId]);

  const beneficiaryId = selectedId ?? listData?.data?.[0]?.id ?? null;

  const beneficiaryKey = useMemo(() => {
    if (!session || !beneficiaryId) return null;
    return ['beneficiaries:detail', beneficiaryId, session.token] as const;
  }, [session, beneficiaryId]);

  const {
    data: beneficiary,
    error: beneficiaryError,
    isLoading: loadingBeneficiary,
  } = useSWR<BeneficiaryRecord | undefined>(beneficiaryKey, ([, id, token]) => getBeneficiary(id, token));

  const formsKey = useMemo(() => {
    if (!session || !beneficiaryId) return null;
    return ['beneficiaries:forms', beneficiaryId, session.token] as const;
  }, [session, beneficiaryId]);

  const {
    data: forms,
    mutate: mutateForms,
    isLoading: loadingForms,
  } = useSWR<{ data: FormSubmissionSummary[] } | undefined>(formsKey, ([, id, token]) =>
    listBeneficiaryForms(id, { limit: 50 }, token),
  );

  const timelineKey = useMemo(() => {
    if (!session || !beneficiaryId) return null;
    return ['beneficiaries:timeline', beneficiaryId, session.token] as const;
  }, [session, beneficiaryId]);

  const { data: timeline, isLoading: loadingTimeline } = useSWR<{ data: TimelineEntry[] } | undefined>(
    timelineKey,
    ([, id, token]) => listBeneficiaryTimeline(id, { limit: 50 }, token),
  );

  const consentsKey = useMemo(() => {
    if (!session || !beneficiaryId) return null;
    return ['beneficiaries:consents', beneficiaryId, session.token] as const;
  }, [session, beneficiaryId]);

  const { data: consents, isLoading: loadingConsents } = useSWR<ConsentRecord[] | undefined>(
    consentsKey,
    ([, id, token]) => listBeneficiaryConsents(id, token),
  );

  useEffect(() => {
    if (feedback) {
      const timeout = setTimeout(() => setFeedback(null), 4000);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [feedback]);

  if (session === undefined) {
    return <LoadingState message="Verificando sessão..." />;
  }

  if (!session) {
    return <LoadingState message="Carregando..." />;
  }

  const handleSubmitForm = async (schema: FormSchemaDefinition, payload: Record<string, unknown>) => {
    if (!beneficiaryId || !session) return;

    setIsSubmitting(true);
    try {
      await submitBeneficiaryForm(
        beneficiaryId,
        {
          formType: schema.slug,
          schemaVersion: '1.0.0',
          data: payload,
        },
        session.token,
      );
      await mutateForms();
      setActiveSchema(null);
      setFeedback('Formulário enviado com sucesso.');
    } catch (error) {
      setFeedback('Não foi possível enviar o formulário. Tente novamente.');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Shell
      title="Beneficiárias"
      description="Gerencie o cadastro, formulários e consentimentos das beneficiárias."
      sidebar={<PrimarySidebar session={session} />}
    >
      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-glass shadow-black/10">
            <h2 className="text-lg font-semibold text-white">Buscar beneficiárias</h2>
            <p className="mt-1 text-sm text-white/70">
              Utilize nome ou código para localizar o perfil desejado e acessar os formulários enviados.
            </p>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar por nome"
              className="mt-3"
            />
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-glass shadow-black/10">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-white/80">Beneficiárias</h3>
            {loadingList && <p className="mt-3 text-sm text-white/70">Carregando lista...</p>}
            {listError && <p className="mt-3 text-sm text-rose-300">Erro ao carregar beneficiárias.</p>}
            <ul className="mt-3 space-y-2">
              {listData?.data?.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(item.id);
                      setActiveTab('perfil');
                      setActiveSchema(null);
                    }}
                    className={clsx(
                      'w-full rounded-2xl border px-4 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-emerald-400',
                      item.id === beneficiaryId
                        ? 'border-emerald-400/60 bg-emerald-500/10 text-white'
                        : 'border-white/10 bg-white/5 text-white/80 hover:border-white/20 hover:bg-white/10',
                    )}
                  >
                    <span className="block text-sm font-medium">{item.fullName}</span>
                    {item.vulnerabilities.length > 0 && (
                      <span className="mt-1 block text-xs text-white/60">
                        {item.vulnerabilities.join(', ')}
                      </span>
                    )}
                  </button>
                </li>
              ))}
              {!loadingList && !listError && listData?.data?.length === 0 && (
                <li className="text-sm text-white/70">Nenhuma beneficiária encontrada.</li>
              )}
            </ul>
          </div>
        </aside>

        <section className="space-y-4">
          {feedback && (
            <div className="rounded-3xl border border-emerald-300/40 bg-emerald-500/10 p-4 text-sm text-emerald-100">
              {feedback}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {FORM_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setActiveSchema(null);
                }}
                className={clsx(
                  'rounded-full px-4 py-2 text-sm transition',
                  activeTab === tab.id
                    ? 'bg-emerald-500 text-white shadow'
                    : 'bg-white/10 text-white/80 hover:bg-white/20',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glass shadow-black/10">
            {activeTab === 'perfil' && (
              <BeneficiaryProfilePanel
                loading={loadingBeneficiary}
                error={beneficiaryError instanceof Error ? beneficiaryError : null}
                beneficiary={beneficiary}
              />
            )}

            {activeTab === 'formularios' && beneficiaryId && (
              <BeneficiaryFormsPanel
                beneficiaryId={beneficiaryId}
                loading={loadingForms}
                forms={forms?.data ?? []}
                activeSchema={activeSchema}
                onSelectSchema={setActiveSchema}
                onSubmit={handleSubmitForm}
                submitting={isSubmitting}
              />
            )}

            {activeTab === 'timeline' && (
              <TimelinePanel
                loading={loadingTimeline}
                timeline={timeline?.data ?? []}
              />
            )}

            {activeTab === 'consentimentos' && (
              <ConsentPanel loading={loadingConsents} consents={consents ?? []} />
            )}
          </div>
        </section>
      </div>
    </Shell>
  );
}

interface BeneficiaryProfilePanelProps {
  loading: boolean;
  error: Error | null;
  beneficiary?: BeneficiaryRecord;
}

function BeneficiaryProfilePanel({ loading, error, beneficiary }: BeneficiaryProfilePanelProps) {
  if (loading) {
    return <p className="text-sm text-white/70">Carregando perfil...</p>;
  }

  if (error) {
    return <p className="text-sm text-rose-300">Não foi possível carregar os dados da beneficiária.</p>;
  }

  if (!beneficiary) {
    return <p className="text-sm text-white/70">Selecione uma beneficiária para visualizar os detalhes.</p>;
  }

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold text-white">{beneficiary.fullName}</h2>
        <p className="mt-1 text-sm text-white/70">
          Código {beneficiary.code ?? '—'} • CPF {beneficiary.cpf ?? '—'} • Telefone {beneficiary.phone1 ?? '—'}
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <InfoCard title="Endereço" value={beneficiary.address ?? 'Não informado'} />
        <InfoCard title="Bairro" value={beneficiary.neighborhood ?? 'Não informado'} />
        <InfoCard title="Cidade" value={beneficiary.city ?? 'Não informado'} />
        <InfoCard title="Estado" value={beneficiary.state ?? 'Não informado'} />
      </div>

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white/80">Composição familiar</h3>
        {beneficiary.householdMembers.length === 0 ? (
          <p className="mt-2 text-sm text-white/70">Nenhum membro familiar registrado.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm text-white/80">
            {beneficiary.householdMembers.map((member) => (
              <li key={member.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <span className="font-medium text-white">{member.name ?? 'Membro da família'}</span>
                <span className="block text-xs text-white/60">
                  {member.relationship ?? '—'} • {member.birthDate ?? 'Data não informada'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white/80">Vulnerabilidades</h3>
        {beneficiary.vulnerabilities.length === 0 ? (
          <p className="mt-2 text-sm text-white/70">Nenhuma vulnerabilidade registrada.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {beneficiary.vulnerabilities.map((vulnerability) => (
              <span key={vulnerability.slug} className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                {vulnerability.label ?? vulnerability.slug}
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

interface BeneficiaryFormsPanelProps {
  beneficiaryId: string;
  loading: boolean;
  forms: FormSubmissionSummary[];
  activeSchema: FormSchemaDefinition | null;
  onSelectSchema: (schema: FormSchemaDefinition | null) => void;
  onSubmit: (schema: FormSchemaDefinition, data: Record<string, unknown>) => Promise<void>;
  submitting: boolean;
}

function BeneficiaryFormsPanel({
  beneficiaryId,
  loading,
  forms,
  activeSchema,
  onSelectSchema,
  onSubmit,
  submitting,
}: BeneficiaryFormsPanelProps) {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Formulários vinculados</h2>
          <p className="mt-1 text-sm text-white/70">Histórico de formulários enviados para esta beneficiária.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {FORM_SCHEMAS.map((schema) => (
            <Button
              key={schema.slug}
              variant={activeSchema?.slug === schema.slug ? 'default' : 'secondary'}
              onClick={() => onSelectSchema(activeSchema?.slug === schema.slug ? null : schema)}
              className="rounded-full"
            >
              {schema.title}
            </Button>
          ))}
        </div>
      </header>

      {loading ? (
        <p className="text-sm text-white/70">Carregando formulários...</p>
      ) : forms.length === 0 ? (
        <p className="text-sm text-white/70">Nenhum formulário encontrado para esta beneficiária.</p>
      ) : (
        <ul className="space-y-2 text-sm text-white/80">
          {forms.map((submission) => (
            <li key={submission.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium text-white">{submission.formType}</span>
                  <span className="block text-xs text-white/60">Versão {submission.schemaVersion}</span>
                </div>
                <span className="text-xs text-white/60">
                  Enviado em {new Date(submission.createdAt).toLocaleString('pt-BR')}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {activeSchema && (
        <div className="rounded-3xl border border-emerald-400/40 bg-emerald-500/10 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Preencher {activeSchema.title}</h3>
            <Button variant="ghost" size="sm" onClick={() => onSelectSchema(null)}>
              Cancelar
            </Button>
          </div>
          <FormRenderer
            schema={activeSchema.schema}
            uiSchema={activeSchema.uiSchema}
            onSubmit={async (data) => {
              await onSubmit(activeSchema, data.formData ?? {});
            }}
            disabled={submitting}
            submitLabel={submitting ? 'Enviando...' : 'Enviar formulário'}
          />
          <p className="mt-2 text-xs text-white/60">
            Os dados serão registrados no histórico da beneficiária ({beneficiaryId}).
          </p>
        </div>
      )}
    </div>
  );
}

interface TimelinePanelProps {
  loading: boolean;
  timeline: TimelineEntry[];
}

function TimelinePanel({ loading, timeline }: TimelinePanelProps) {
  if (loading) {
    return <p className="text-sm text-white/70">Carregando timeline...</p>;
  }

  if (timeline.length === 0) {
    return <p className="text-sm text-white/70">Nenhum evento registrado para esta beneficiária.</p>;
  }

  return (
    <ul className="space-y-3">
      {timeline.map((event) => (
        <li key={event.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between text-sm text-white/70">
            <span className="uppercase tracking-wide">{event.kind}</span>
            <span>{new Date(event.date).toLocaleString('pt-BR')}</span>
          </div>
          <h4 className="mt-2 text-base font-semibold text-white">{event.title}</h4>
          {event.description && <p className="mt-1 text-sm text-white/80">{event.description}</p>}
        </li>
      ))}
    </ul>
  );
}

interface ConsentPanelProps {
  loading: boolean;
  consents: ConsentRecord[];
}

function ConsentPanel({ loading, consents }: ConsentPanelProps) {
  if (loading) {
    return <p className="text-sm text-white/70">Carregando consentimentos...</p>;
  }

  if (consents.length === 0) {
    return <p className="text-sm text-white/70">Nenhum consentimento registrado.</p>;
  }

  return (
    <div className="space-y-2 text-sm text-white/80">
      {consents.map((consent) => (
        <div key={consent.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-medium text-white">{consent.type}</span>
              <span className="block text-xs text-white/60">Versão {consent.textVersion}</span>
            </div>
            <span className="text-xs text-white/60">
              {consent.granted ? 'Concedido' : 'Não concedido'} em{' '}
              {consent.grantedAt ? new Date(consent.grantedAt).toLocaleDateString('pt-BR') : '—'}
            </span>
          </div>
          {consent.evidence && <p className="mt-2 text-xs text-white/60">Evidência: {consent.evidence}</p>}
        </div>
      ))}
    </div>
  );
}

interface InfoCardProps {
  title: string;
  value: string;
}

function InfoCard({ title, value }: InfoCardProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <span className="text-xs uppercase tracking-wide text-white/60">{title}</span>
      <span className="mt-1 block text-sm text-white">{value}</span>
    </div>
  );
}
