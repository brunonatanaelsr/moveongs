import { FORM_SCHEMAS } from './formSchemas';
import type {
  ActionItem,
  AttendanceRecord,
  BeneficiaryProfile,
  FormSubmission,
  ProjectSummary,
  TimelineEvent,
} from '../types/operations';

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function randomId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

const TIMELINE_EVENTS: TimelineEvent[] = [
  {
    id: 'event-01',
    date: daysAgo(2),
    type: 'formulario',
    title: 'Anamnese social preenchida',
    description: 'Formulário completo pela recepção e validado pela técnica de referência.',
    actor: 'Ana Costa',
    tags: ['form.anamnese_social', 'v1'],
  },
  {
    id: 'event-02',
    date: daysAgo(5),
    type: 'matricula',
    title: 'Matrícula confirmada na Oficina de Costura',
    description: 'Beneficiária aceita acordos de convivência e turma com início imediato.',
    actor: 'João Pereira',
    tags: ['oficina_costura'],
  },
  {
    id: 'event-03',
    date: daysAgo(9),
    type: 'consentimento',
    title: 'TCLE e autorização de imagem assinados',
    description: 'Registro de consentimento LGPD e autorização de uso de imagem por 2 anos.',
    actor: 'Clara Lima',
    tags: ['consentimento'],
  },
];

const ACTION_ITEMS: ActionItem[] = [
  {
    id: 'item-01',
    description: 'Atualizar currículo e encaminhar para vaga de auxiliar de cozinha',
    responsible: 'Equipe de Empregabilidade',
    dueDate: daysAgo(-5),
    status: 'em_andamento',
    support: 'Agendar oficina com voluntária HR Tech',
  },
  {
    id: 'item-02',
    description: 'Agendar consulta odontológica via SUS',
    responsible: 'Técnica de referência',
    dueDate: daysAgo(-2),
    status: 'pendente',
  },
  {
    id: 'item-03',
    description: 'Participar da roda de conversa de educação financeira',
    responsible: 'Beneficiária',
    dueDate: daysAgo(7),
    status: 'concluida',
    support: 'Coordenação pedagógica reservou vaga para próxima turma',
  },
];

const FORM_SUBMISSIONS: FormSubmission[] = [
  {
    id: 'submission-01',
    schemaId: 'form.anamnese_social',
    schemaVersion: 'v1',
    submittedAt: daysAgo(2),
    submittedBy: 'Ana Costa',
    status: 'enviado',
    payload: { nome: 'Maria Aparecida', idade: 32 },
  },
  {
    id: 'submission-02',
    schemaId: 'form.consentimentos',
    schemaVersion: 'v1',
    submittedAt: daysAgo(9),
    submittedBy: 'Clara Lima',
    status: 'enviado',
    payload: { nome: 'Maria Aparecida', finalidades: ['atendimento', 'relatorios'] },
  },
];

const ATTENDANCE_HISTORY: Record<string, AttendanceRecord[]> = {
  'classroom-costura-matutino': [
    { id: randomId('att'), date: daysAgo(1), status: 'presente', recordedBy: 'Equipe Pedagógica' },
    { id: randomId('att'), date: daysAgo(3), status: 'presente', recordedBy: 'Equipe Pedagógica' },
    { id: randomId('att'), date: daysAgo(5), status: 'ausente', justification: 'Doença', recordedBy: 'Equipe Pedagógica' },
    { id: randomId('att'), date: daysAgo(7), status: 'presente', recordedBy: 'Equipe Pedagógica' },
  ],
};

export const PROJECTS: ProjectSummary[] = [
  {
    id: 'project-costura',
    name: 'Oficina de Costura Criativa',
    description:
      'Formação técnica e geração de renda por meio da costura criativa, com foco em mulheres chefes de família.',
    focus: 'Empregabilidade & empreendedorismo',
    cohorts: [
      {
        id: 'classroom-costura-matutino',
        name: 'Turma Matutina',
        schedule: 'Terças e quintas — 9h às 11h',
        capacity: 18,
        location: 'Sede Campo Limpo',
        educator: 'Juliana Figueiredo',
      },
      {
        id: 'classroom-costura-vespertino',
        name: 'Turma Vespertina',
        schedule: 'Terças e quintas — 14h às 16h',
        capacity: 18,
        location: 'Sede Campo Limpo',
        educator: 'Juliana Figueiredo',
      },
    ],
    capacity: 36,
    activeEnrollments: 28,
    riskAlerts: 4,
    attendanceRate: 0.82,
  },
  {
    id: 'project-tecnologia',
    name: 'Residência em Tecnologia & Dados',
    description:
      'Programa intensivo com foco em desenvolvimento front-end, dados e competências socioemocionais.',
    focus: 'Educação & tecnologia',
    cohorts: [
      {
        id: 'classroom-tech-integral',
        name: 'Turma Integral',
        schedule: 'Segunda a sexta — 9h às 16h',
        capacity: 25,
        location: 'Hub Capão Redondo',
        educator: 'Equipe Tech Voluntária',
      },
    ],
    capacity: 25,
    activeEnrollments: 20,
    riskAlerts: 2,
    attendanceRate: 0.9,
  },
];

export const BENEFICIARIES: BeneficiaryProfile[] = [
  {
    id: 'beneficiary-01',
    name: 'Maria Aparecida Silva',
    code: 'IMM-2024-001',
    birthDate: '1992-04-19',
    phone: '(11) 98877-1234',
    email: 'maria.aparecida@exemplo.com',
    address: 'Rua das Flores, 120',
    neighborhood: 'Capão Redondo',
    status: 'ativa',
    vulnerabilities: ['Renda instável', 'Mãe solo', 'Dependente química em recuperação'],
    documents: { rg: '1234567-8 SSP/SP', cpf: '123.456.789-00', nis: '12345678901' },
    household: [
      {
        id: 'member-01',
        name: 'Ana Júlia Silva',
        birthDate: '2010-08-12',
        relation: 'Filha',
        works: false,
        income: 0,
      },
      {
        id: 'member-02',
        name: 'José Carlos Silva',
        birthDate: '1958-06-03',
        relation: 'Pai',
        works: true,
        income: 1420,
      },
    ],
    socioeconomicNotes:
      'Beneficiária recém-desempregada, busca recolocação na área de serviços gerais. Recebe benefício eventual da prefeitura.',
    actionPlan: {
      id: 'plan-01',
      updatedAt: daysAgo(1),
      goal: 'Atingir estabilidade financeira com renda mínima de 2 salários mínimos em 6 meses.',
      priorityAreas: ['Renda e trabalho', 'Rede de apoio', 'Saúde mental'],
      items: ACTION_ITEMS,
      evaluations: [
        { date: daysAgo(30), summary: 'Evolução positiva com adesão às oficinas.', score: 7 },
        { date: daysAgo(5), summary: 'Necessidade de reforçar apoio psicossocial.', score: 6 },
      ],
    },
    timeline: TIMELINE_EVENTS,
    consents: [
      {
        id: 'consent-01',
        type: 'LGPD geral',
        version: 'v1',
        status: 'assinado',
        signedAt: daysAgo(9),
        expiresAt: daysAgo(-365),
        collectedBy: 'Clara Lima',
      },
      {
        id: 'consent-02',
        type: 'Uso de imagem',
        version: 'v1',
        status: 'pendente',
      },
    ],
    enrollments: [
      {
        id: 'enrollment-01',
        projectId: 'project-costura',
        classroomId: 'classroom-costura-matutino',
        startDate: daysAgo(14),
        status: 'ativa',
        agreementsAccepted: true,
      },
    ],
    attendance: ATTENDANCE_HISTORY,
  },
  {
    id: 'beneficiary-02',
    name: 'Fernanda Oliveira Santos',
    code: 'IMM-2023-044',
    birthDate: '1998-11-02',
    phone: '(11) 97766-4321',
    address: 'Rua Primavera, 45',
    neighborhood: 'Jardim São Luís',
    status: 'risco',
    vulnerabilities: ['Violência doméstica', 'Desemprego', 'Baixa escolaridade'],
    documents: { rg: '9988776-5 SSP/SP', cpf: '321.654.987-00' },
    household: [
      {
        id: 'member-03',
        name: 'Caroline Santos',
        birthDate: '2018-03-10',
        relation: 'Filha',
        works: false,
        income: 0,
      },
    ],
    actionPlan: {
      id: 'plan-02',
      updatedAt: daysAgo(4),
      goal: 'Reduzir risco social com reforço de rede de apoio e encaminhamentos de saúde.',
      priorityAreas: ['Saúde mental', 'Rede de apoio'],
      items: ACTION_ITEMS.slice(0, 2),
      evaluations: [{ date: daysAgo(12), summary: 'Plano recém-iniciado.', score: 5 }],
    },
    timeline: [TIMELINE_EVENTS[1]],
    consents: [
      {
        id: 'consent-03',
        type: 'LGPD geral',
        version: 'v1',
        status: 'pendente',
      },
    ],
    enrollments: [],
    attendance: {},
  },
];

export const INITIAL_FORM_SUBMISSIONS = FORM_SUBMISSIONS;

export const ALL_FORM_SCHEMAS = FORM_SCHEMAS;

export type { FormSubmission };
