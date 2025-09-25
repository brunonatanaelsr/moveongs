'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Shell } from '../../components/Shell';
import { PrimarySidebar } from '../../components/PrimarySidebar';
import { useRequirePermission } from '../../hooks/useRequirePermission';
import { ALL_FORM_SCHEMAS, BENEFICIARIES, INITIAL_FORM_SUBMISSIONS } from '../../data/mockOperations';
import type { FormSchema, FormSubmission, BeneficiaryProfile, TimelineEvent, ConsentRecord, ActionItem } from '../../types/operations';
import { FormRenderer } from '../../components/FormRenderer';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { LoadingState } from '../../components/LoadingState';

const FORM_TABS = [
  { id: 'perfil', label: 'Perfil e dados civis' },
  { id: 'formularios', label: 'Formulários oficiais' },
  { id: 'plano', label: 'Plano de ação' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'consentimentos', label: 'Consentimentos' },
];

type BeneficiaryState = BeneficiaryProfile;

function cloneBeneficiaries(): BeneficiaryState[] {
  return BENEFICIARIES.map((beneficiary) => ({
    ...beneficiary,
    household: beneficiary.household.map((member) => ({ ...member })),
    actionPlan: {
      ...beneficiary.actionPlan,
      items: beneficiary.actionPlan.items.map((item) => ({ ...item })),
      evaluations: beneficiary.actionPlan.evaluations.map((evaluation) => ({ ...evaluation })),
    },
    timeline: beneficiary.timeline.map((event) => ({ ...event })),
    consents: beneficiary.consents.map((consent) => ({ ...consent })),
    enrollments: beneficiary.enrollments.map((enrollment) => ({ ...enrollment })),
    attendance: Object.fromEntries(
      Object.entries(beneficiary.attendance).map(([classroomId, records]) => [
        classroomId,
        records.map((record) => ({ ...record })),
      ]),
    ),
  }));
}

function formatDate(dateIso: string | undefined) {
  if (!dateIso) return '-';
  return new Date(dateIso).toLocaleDateString('pt-BR');
}

function formatDateTime(dateIso: string) {
  return new Date(dateIso).toLocaleString('pt-BR');
}

function getSchemaTitle(schema: FormSchema) {
  switch (schema.category) {
    case 'anamnese':
      return 'Anamnese Social';
    case 'declaracao_recibo':
      return 'Declaração & recibo';
    case 'evolucao':
      return 'Ficha de evolução';
    case 'inscricao':
      return 'Inscrição em projeto';
    case 'consentimento':
      return 'Consentimentos LGPD';
    case 'visao_holistica':
      return 'Visão holística';
    case 'plano_acao':
      return 'Plano de ação';
    case 'roda_da_vida':
      return 'Roda da vida';
    default:
      return schema.title;
  }
}

export default function BeneficiariesPage() {
  const session = useRequirePermission(['beneficiaries:read', 'beneficiaries:update']);
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryState[]>(() => cloneBeneficiaries());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBeneficiaryId, setSelectedBeneficiaryId] = useState(beneficiaries[0]?.id ?? '');
  const [activeTab, setActiveTab] = useState('perfil');
  const [activeForm, setActiveForm] = useState<FormSchema | null>(null);
  const [submissions, setSubmissions] = useState<FormSubmission[]>(INITIAL_FORM_SUBMISSIONS);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (session === undefined) {
    return <LoadingState message="Verificando sessão..." />;
  }

  if (!session) {
    return <LoadingState message="Carregando..." />;
  }

  const term = searchTerm.trim().toLowerCase();
  const filteredBeneficiaries = term
    ? beneficiaries.filter((beneficiary) => beneficiary.name.toLowerCase().includes(term))
    : beneficiaries;

  const selectedBeneficiary = beneficiaries.find((beneficiary) => beneficiary.id === selectedBeneficiaryId) ?? beneficiaries[0];

  const availableForms = ALL_FORM_SCHEMAS;

  const handleSelectBeneficiary = (beneficiaryId: string) => {
    setSelectedBeneficiaryId(beneficiaryId);
    setActiveForm(null);
    setActiveTab('perfil');
  };

  const appendTimeline = (beneficiaryId: string, event: TimelineEvent) => {
    setBeneficiaries((prev) =>
      prev.map((beneficiary) =>
        beneficiary.id === beneficiaryId
          ? { ...beneficiary, timeline: [event, ...beneficiary.timeline] }
          : beneficiary,
      ),
    );
  };

  const handleFormSubmit = (schema: FormSchema, payload: Record<string, unknown>) => {
    const nowIso = new Date().toISOString();
    setSubmissions((prev) => [
      ...prev,
      {
        id: `submission-${Math.random().toString(36).slice(2, 8)}`,
        schemaId: schema.id,
        schemaVersion: schema.version,
        submittedAt: nowIso,
        submittedBy: session.user.name,
        status: 'enviado',
        payload,
      },
    ]);

    appendTimeline(selectedBeneficiary.id, {
      id: `timeline-${Math.random().toString(36).slice(2, 8)}`,
      date: nowIso,
      type: 'formulario',
      title: `${schema.title} preenchido`,
      description: `Formulário ${schema.version} armazenado com sucesso pela equipe ${session.user.name}.`,
      actor: session.user.name,
      tags: [schema.id, schema.version],
    });

    if (schema.category === 'consentimento') {
      setBeneficiaries((prev) =>
        prev.map((beneficiary) => {
          if (beneficiary.id !== selectedBeneficiary.id) return beneficiary;
          const updatedConsents = beneficiary.consents.map((consent) =>
            consent.status === 'assinado'
              ? consent
              : {
                  ...consent,
                  status: 'assinado',
                  signedAt: nowIso,
                  collectedBy: session.user.name,
                },
          );
          return { ...beneficiary, consents: updatedConsents };
        }),
      );
    }

    if (schema.category === 'plano_acao') {
      const acoes = (payload.acoes as Array<Record<string, string>>) ?? [];
      const avaliacoes = (payload.avaliacoes as Array<Record<string, string>>) ?? [];
      setBeneficiaries((prev) =>
        prev.map((beneficiary) => {
          if (beneficiary.id !== selectedBeneficiary.id) return beneficiary;
          const actionItems: ActionItem[] = acoes.map((acao, index) => ({
            id: `acao-${index}-${Math.random().toString(36).slice(2, 8)}`,
            description: acao.descricao ?? 'Ação planejada',
            responsible: acao.responsavel ?? session.user.name,
            dueDate: acao.prazo ?? nowIso,
            status: (acao.status as ActionItem['status']) ?? 'pendente',
            support: acao.suporte,
          }));
          return {
            ...beneficiary,
            actionPlan: {
              ...beneficiary.actionPlan,
              updatedAt: nowIso,
              goal: (payload.objetivo_principal as string) ?? beneficiary.actionPlan.goal,
              priorityAreas: Array.isArray(payload.areas_prioritarias)
                ? (payload.areas_prioritarias as string[])
                : beneficiary.actionPlan.priorityAreas,
              items: actionItems.length > 0 ? actionItems : beneficiary.actionPlan.items,
              evaluations:
                avaliacoes.length > 0
                  ? avaliacoes.map((avaliacao) => ({
                      date: avaliacao.data ?? nowIso,
                      summary: avaliacao.resumo ?? 'Avaliação registrada via formulário.',
                      score: avaliacao.pontuacao ? Number(avaliacao.pontuacao) : undefined,
                    }))
                  : beneficiary.actionPlan.evaluations,
            },
          };
        }),
      );
    }

    setFeedback('Formulário registrado na timeline e armazenamento local atualizado.');
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleConsentStatus = (consent: ConsentRecord, status: ConsentRecord['status']) => {
    const nowIso = new Date().toISOString();
    setBeneficiaries((prev) =>
      prev.map((beneficiary) =>
        beneficiary.id === selectedBeneficiary.id
          ? {
              ...beneficiary,
              consents: beneficiary.consents.map((item) =>
                item.id === consent.id
                  ? { ...item, status, signedAt: status === 'assinado' ? nowIso : item.signedAt }
                  : item,
              ),
            }
          : beneficiary,
      ),
    );

    appendTimeline(selectedBeneficiary.id, {
      id: `timeline-${Math.random().toString(36).slice(2, 8)}`,
      date: nowIso,
      type: 'consentimento',
      title: `${consent.type} atualizado`,
      description: `Status alterado para ${status}.`,
      actor: session.user.name,
      tags: ['consentimento'],
    });
  };

  return (
    <Shell
      title="Gestão de beneficiárias"
      description="Acompanhe fichas cadastrais, formulários, planos de ação e consentimentos de cada beneficiária."
      sidebar={<PrimarySidebar session={session} />}
    >
      {feedback && (
        <div className="rounded-3xl border border-emerald-300/40 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          {feedback}
        </div>
      )}

      <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glass shadow-black/10">
          <div className="space-y-2">
            <Input
              label="Buscar beneficiária"
              placeholder="Digite o nome para filtrar"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <ul className="space-y-2">
            {filteredBeneficiaries.map((beneficiary) => {
              const isActive = beneficiary.id === selectedBeneficiary?.id;
              return (
                <li key={beneficiary.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectBeneficiary(beneficiary.id)}
                    className={clsx(
                      'w-full rounded-3xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-white/30 hover:bg-white/10',
                      isActive && 'border-cyan-300/60 bg-cyan-500/10 shadow-glass',
                    )}
                  >
                    <p className="text-base font-semibold text-white">{beneficiary.name}</p>
                    <p className="text-xs text-white/60">{beneficiary.code}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                      {beneficiary.vulnerabilities.map((vulnerability) => (
                        <span key={vulnerability} className="rounded-xl bg-rose-500/20 px-2 py-0.5 text-rose-100">
                          {vulnerability}
                        </span>
                      ))}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <div className="space-y-6">
          <header className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glass shadow-black/10">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-white">{selectedBeneficiary?.name}</h2>
                <p className="text-sm text-white/70">
                  Código {selectedBeneficiary?.code} · {selectedBeneficiary?.neighborhood}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm">Exportar ficha PDF</Button>
                <Button size="sm">Registrar atendimento</Button>
              </div>
            </div>
          </header>

          <nav className="flex flex-wrap gap-2">
            {FORM_TABS.map((tab) => {
              const isActive = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    setActiveForm(null);
                  }}
                  className={clsx(
                    'rounded-2xl border px-4 py-2 text-sm font-semibold transition',
                    isActive
                      ? 'border-cyan-300/60 bg-cyan-500/10 text-white shadow-glass'
                      : 'border-white/10 bg-white/5 text-white/70 hover:border-white/25 hover:bg-white/10',
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <section>
            {activeTab === 'perfil' && selectedBeneficiary && (
              <ProfileTab beneficiary={selectedBeneficiary} />
            )}

            {activeTab === 'formularios' && selectedBeneficiary && (
              <FormsTab
                forms={availableForms}
                submissions={submissions.filter((submission) =>
                  (submission.payload.nome as string | undefined)?.includes(selectedBeneficiary.name) ||
                  submission.payload.codigo_matricula === selectedBeneficiary.code ||
                  true,
                )}
                activeForm={activeForm}
                onSelectForm={setActiveForm}
                onSubmitForm={(schema, data) => handleFormSubmit(schema, data)}
              />
            )}

            {activeTab === 'plano' && selectedBeneficiary && (
              <ActionPlanTab beneficiary={selectedBeneficiary} setBeneficiaries={setBeneficiaries} />
            )}

            {activeTab === 'timeline' && selectedBeneficiary && (
              <TimelineTab timeline={selectedBeneficiary.timeline} />
            )}

            {activeTab === 'consentimentos' && selectedBeneficiary && (
              <ConsentsTab consents={selectedBeneficiary.consents} onChangeStatus={handleConsentStatus} />
            )}
          </section>
        </div>
      </section>
    </Shell>
  );
}

interface ProfileTabProps {
  beneficiary: BeneficiaryState;
}

function ProfileTab({ beneficiary }: ProfileTabProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glass shadow-black/10">
        <h3 className="text-lg font-semibold text-white">Dados civis e contatos</h3>
        <dl className="space-y-2 text-sm text-white/80">
          <div className="flex justify-between gap-4">
            <dt className="text-white/60">Data de nascimento</dt>
            <dd>{formatDate(beneficiary.birthDate)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-white/60">Telefone</dt>
            <dd>{beneficiary.phone}</dd>
          </div>
          {beneficiary.email && (
            <div className="flex justify-between gap-4">
              <dt className="text-white/60">E-mail</dt>
              <dd>{beneficiary.email}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-white/60">Endereço</dt>
            <dd className="text-right">{beneficiary.address}, {beneficiary.neighborhood}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-white/60">Documentos</dt>
            <dd className="text-right">RG {beneficiary.documents.rg} · CPF {beneficiary.documents.cpf}</dd>
          </div>
        </dl>
        {beneficiary.socioeconomicNotes && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
            <p className="text-xs uppercase tracking-[0.2em] text-white/40">Contexto socioeconômico</p>
            <p className="mt-2">{beneficiary.socioeconomicNotes}</p>
          </div>
        )}
      </div>

      <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glass shadow-black/10">
        <h3 className="text-lg font-semibold text-white">Composição familiar</h3>
        <ul className="space-y-2 text-sm text-white/80">
          {beneficiary.household.map((member) => (
            <li
              key={member.id}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-3"
            >
              <div>
                <p className="font-semibold text-white">{member.name}</p>
                <p className="text-xs text-white/60">{member.relation}</p>
              </div>
              <div className="text-right text-xs text-white/60">
                <p>Nascimento: {formatDate(member.birthDate)}</p>
                <p>{member.works ? 'Contribui com renda' : 'Sem renda'}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

interface FormsTabProps {
  forms: FormSchema[];
  submissions: FormSubmission[];
  activeForm: FormSchema | null;
  onSelectForm: (schema: FormSchema | null) => void;
  onSubmitForm: (schema: FormSchema, payload: Record<string, unknown>) => void;
}

function FormsTab({ forms, submissions, activeForm, onSelectForm, onSubmitForm }: FormsTabProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glass shadow-black/10">
        <h3 className="text-lg font-semibold text-white">Formulários disponíveis</h3>
        <ul className="space-y-2 text-sm text-white/80">
          {forms.map((form) => {
            const isActive = activeForm?.id === form.id;
            return (
              <li key={form.id}>
                <button
                  type="button"
                  onClick={() => onSelectForm(isActive ? null : form)}
                  className={clsx(
                    'w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-white/30 hover:bg-white/10',
                    isActive && 'border-cyan-300/60 bg-cyan-500/10 text-white shadow-glass',
                  )}
                >
                  <p className="font-semibold text-white">{getSchemaTitle(form)}</p>
                  <p className="text-xs text-white/60">Versão {form.version}</p>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-xs text-white/60">
          <p className="font-semibold text-white">Histórico recente</p>
          <ul className="mt-2 space-y-1">
            {submissions.slice(-5).reverse().map((submission) => (
              <li key={submission.id}>
                {formatDateTime(submission.submittedAt)} — {submission.submittedBy}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glass shadow-black/10">
        {activeForm ? (
          <div className="space-y-4">
            <header className="space-y-1">
              <h3 className="text-xl font-semibold text-white">{activeForm.title}</h3>
              <p className="text-sm text-white/70">{activeForm.description}</p>
            </header>
            <FormRenderer
              schema={activeForm}
              onSubmit={(data) => onSubmitForm(activeForm, data)}
              submitLabel="Salvar formulário"
            />
          </div>
        ) : (
          <p className="text-sm text-white/60">Selecione um formulário para iniciar o preenchimento.</p>
        )}
      </div>
    </div>
  );
}

interface ActionPlanTabProps {
  beneficiary: BeneficiaryState;
  setBeneficiaries: React.Dispatch<React.SetStateAction<BeneficiaryState[]>>;
}

function ActionPlanTab({ beneficiary, setBeneficiaries }: ActionPlanTabProps) {
  const handleStatusChange = (itemId: string, status: ActionItem['status']) => {
    setBeneficiaries((prev) =>
      prev.map((item) =>
        item.id === beneficiary.id
          ? {
              ...item,
              actionPlan: {
                ...item.actionPlan,
                items: item.actionPlan.items.map((actionItem) =>
                  actionItem.id === itemId ? { ...actionItem, status } : actionItem,
                ),
              },
            }
          : item,
      ),
    );
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glass shadow-black/10">
        <h3 className="text-xl font-semibold text-white">Objetivo principal</h3>
        <p className="mt-2 text-sm text-white/70">{beneficiary.actionPlan.goal}</p>
        <p className="mt-3 text-xs text-white/60">
          Áreas prioritárias: {beneficiary.actionPlan.priorityAreas.join(', ')}
        </p>
      </div>

      <div className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glass shadow-black/10">
        <h3 className="text-lg font-semibold text-white">Ações em andamento</h3>
        <ul className="space-y-3 text-sm text-white/80">
          {beneficiary.actionPlan.items.map((item) => (
            <li
              key={item.id}
              className="rounded-2xl border border-white/10 bg-white/5 p-4"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-semibold text-white">{item.description}</p>
                  <p className="text-xs text-white/60">
                    Responsável: {item.responsible} · Prazo {formatDate(item.dueDate)}
                  </p>
                  {item.support && <p className="text-xs text-white/60">Suporte IMM: {item.support}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={clsx(
                      'rounded-xl px-3 py-1 text-xs font-semibold',
                      item.status === 'concluida'
                        ? 'bg-emerald-500/20 text-emerald-100'
                        : item.status === 'atrasada'
                          ? 'bg-rose-500/20 text-rose-100'
                          : 'bg-amber-500/20 text-amber-100',
                    )}
                  >
                    {item.status.replace('_', ' ')}
                  </span>
                  <select
                    value={item.status}
                    onChange={(event) => handleStatusChange(item.id, event.target.value as ActionItem['status'])}
                    className="rounded-2xl border border-white/10 bg-slate-900/60 p-2 text-xs text-white focus:border-cyan-300 focus:outline-none"
                  >
                    <option value="pendente">Pendente</option>
                    <option value="em_andamento">Em andamento</option>
                    <option value="concluida">Concluída</option>
                    <option value="atrasada">Atrasada</option>
                  </select>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glass shadow-black/10">
        <h3 className="text-lg font-semibold text-white">Avaliações periódicas</h3>
        <ul className="mt-3 space-y-2 text-sm text-white/80">
          {beneficiary.actionPlan.evaluations.map((evaluation) => (
            <li key={evaluation.date} className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <p className="font-semibold text-white">{formatDate(evaluation.date)}</p>
              <p className="text-xs text-white/60">{evaluation.summary}</p>
              {evaluation.score && <p className="text-xs text-white/60">Pontuação: {evaluation.score}</p>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

interface TimelineTabProps {
  timeline: TimelineEvent[];
}

function TimelineTab({ timeline }: TimelineTabProps) {
  return (
    <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glass shadow-black/10">
      <h3 className="text-lg font-semibold text-white">Eventos recentes</h3>
      <ul className="space-y-3">
        {timeline.map((event) => (
          <li
            key={event.id}
            className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80"
          >
            <div className="flex items-center justify-between">
              <p className="font-semibold text-white">{event.title}</p>
              <span className="text-xs text-white/60">{formatDateTime(event.date)}</span>
            </div>
            <p className="mt-1 text-white/70">{event.description}</p>
            <p className="mt-2 text-xs text-white/50">Responsável: {event.actor}</p>
            {event.tags && (
              <div className="mt-2 flex flex-wrap gap-2">
                {event.tags.map((tag) => (
                  <span key={tag} className="rounded-xl bg-cyan-500/20 px-2 py-0.5 text-[11px] text-cyan-100">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface ConsentsTabProps {
  consents: ConsentRecord[];
  onChangeStatus: (consent: ConsentRecord, status: ConsentRecord['status']) => void;
}

function ConsentsTab({ consents, onChangeStatus }: ConsentsTabProps) {
  return (
    <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glass shadow-black/10">
      <h3 className="text-lg font-semibold text-white">Termos e autorizações</h3>
      <table className="w-full text-left text-sm text-white/80">
        <thead>
          <tr className="text-xs uppercase tracking-wider text-white/60">
            <th className="pb-2 pr-4">Tipo</th>
            <th className="pb-2 pr-4">Status</th>
            <th className="pb-2 pr-4">Assinado em</th>
            <th className="pb-2 pr-4">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {consents.map((consent) => (
            <tr key={consent.id}>
              <td className="py-3 pr-4 text-white">{consent.type}</td>
              <td className="py-3 pr-4">
                <span
                  className={clsx(
                    'rounded-xl px-3 py-1 text-xs font-semibold',
                    consent.status === 'assinado'
                      ? 'bg-emerald-500/20 text-emerald-100'
                      : consent.status === 'revogado'
                        ? 'bg-rose-500/20 text-rose-100'
                        : 'bg-amber-500/20 text-amber-100',
                  )}
                >
                  {consent.status}
                </span>
              </td>
              <td className="py-3 pr-4">{consent.signedAt ? formatDate(consent.signedAt) : '-'}</td>
              <td className="py-3 pr-4">
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => onChangeStatus(consent, 'assinado')}>
                    Registrar assinatura
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onChangeStatus(consent, 'revogado')}>
                    Revogar
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
