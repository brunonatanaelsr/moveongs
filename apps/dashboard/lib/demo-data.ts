export type DemoBeneficiary = {
  id: string;
  name: string;
  code: string;
  status: 'ativa' | 'aguardando' | 'desligada';
  vulnerabilities: string[];
  lastInteraction: string;
};

export type DemoProject = {
  id: string;
  name: string;
  description: string;
  capacity: number;
  enrolled: number;
  waitlist: number;
  schedule: string;
  location: string;
};

export type DemoCohort = {
  id: string;
  projectId: string;
  name: string;
  weekday: string;
  time: string;
  educator: string;
  capacity: number;
};

export type DemoAttendanceRecord = {
  beneficiaryId: string;
  status: 'presente' | 'falta_justificada' | 'falta_injustificada' | 'atraso';
  justification?: string;
};

export type DemoActionPlanTask = {
  id: string;
  title: string;
  status: 'planejada' | 'em_andamento' | 'concluida' | 'atrasada';
  responsible: string;
  dueDate: string;
  support: string;
  notes?: string;
};

export type DemoActionPlan = {
  id: string;
  beneficiaryId: string;
  objective: string;
  createdAt: string;
  owner: string;
  status: 'ativo' | 'concluido';
  tasks: DemoActionPlanTask[];
};

export const demoBeneficiaries: DemoBeneficiary[] = [
  {
    id: 'b1',
    name: 'Maria Silva',
    code: 'IMM-001',
    status: 'ativa',
    vulnerabilities: ['Insegurança alimentar', 'Desemprego'],
    lastInteraction: '2024-08-12',
  },
  {
    id: 'b2',
    name: 'Joana Pereira',
    code: 'IMM-014',
    status: 'ativa',
    vulnerabilities: ['Violência doméstica'],
    lastInteraction: '2024-08-10',
  },
  {
    id: 'b3',
    name: 'Clara Ramos',
    code: 'IMM-028',
    status: 'aguardando',
    vulnerabilities: ['Pessoa com deficiência'],
    lastInteraction: '2024-08-05',
  },
  {
    id: 'b4',
    name: 'Patrícia Gomes',
    code: 'IMM-033',
    status: 'ativa',
    vulnerabilities: ['Gestante ou puérpera', 'Dependência química'],
    lastInteraction: '2024-08-09',
  },
];

export const demoProjects: DemoProject[] = [
  {
    id: 'p1',
    name: 'Oficina de Gastronomia Social',
    description: 'Capacitação culinária com foco em geração de renda e segurança alimentar.',
    capacity: 25,
    enrolled: 22,
    waitlist: 5,
    schedule: 'Terças e quintas • 14h às 17h',
    location: 'Cozinha Escola IMM',
  },
  {
    id: 'p2',
    name: 'Círculo de Mulheres',
    description: 'Grupo terapêutico e de fortalecimento de vínculos familiares.',
    capacity: 18,
    enrolled: 16,
    waitlist: 2,
    schedule: 'Quartas • 9h às 11h',
    location: 'Sala Multiuso 2',
  },
  {
    id: 'p3',
    name: 'Laboratório de Tecnologia Social',
    description: 'Formação em competências digitais e empreendedorismo.',
    capacity: 20,
    enrolled: 17,
    waitlist: 3,
    schedule: 'Sábados • 10h às 13h',
    location: 'Laboratório Criativo',
  },
];

export const demoCohorts: DemoCohort[] = [
  { id: 'c1', projectId: 'p1', name: 'Turma Vespertina', weekday: 'Terça', time: '14h', educator: 'Ana Paula', capacity: 15 },
  { id: 'c2', projectId: 'p1', name: 'Turma Matinal', weekday: 'Quinta', time: '9h', educator: 'João Pedro', capacity: 12 },
  { id: 'c3', projectId: 'p2', name: 'Grupo I', weekday: 'Quarta', time: '9h', educator: 'Clara Lima', capacity: 18 },
  { id: 'c4', projectId: 'p3', name: 'Edição Imersiva', weekday: 'Sábado', time: '10h', educator: 'Rafaela Dias', capacity: 20 },
];

export const demoActionPlans: DemoActionPlan[] = [
  {
    id: 'ap1',
    beneficiaryId: 'b1',
    objective: 'Fortalecer geração de renda familiar com produção e venda de alimentos.',
    createdAt: '2024-05-02',
    owner: 'Técnica de referência: Camila Andrade',
    status: 'ativo',
    tasks: [
      {
        id: 't1',
        title: 'Mapear receitas de baixo custo',
        status: 'concluida',
        responsible: 'Maria Silva',
        dueDate: '2024-06-15',
        support: 'Mentoria gastronômica IMM',
        notes: 'Receitas aprovadas pela nutricionista.',
      },
      {
        id: 't2',
        title: 'Realizar oficina de precificação',
        status: 'em_andamento',
        responsible: 'Equipe de geração de renda',
        dueDate: '2024-08-20',
        support: 'Assessoria financeira voluntária',
      },
      {
        id: 't3',
        title: 'Participar de feira comunitária',
        status: 'planejada',
        responsible: 'Maria Silva',
        dueDate: '2024-09-05',
        support: 'Infraestrutura e transporte IMM',
      },
    ],
  },
  {
    id: 'ap2',
    beneficiaryId: 'b2',
    objective: 'Reduzir fatores de risco associados à violência doméstica e fortalecer rede de apoio.',
    createdAt: '2024-04-18',
    owner: 'Técnica de referência: Juliana Nogueira',
    status: 'ativo',
    tasks: [
      {
        id: 't4',
        title: 'Encaminhar para atendimento jurídico',
        status: 'concluida',
        responsible: 'Equipe jurídica parceira',
        dueDate: '2024-05-30',
        support: 'ONG Parceira Direitos em Rede',
      },
      {
        id: 't5',
        title: 'Iniciar acompanhamento psicológico',
        status: 'em_andamento',
        responsible: 'Clínica parceira',
        dueDate: '2024-08-31',
        support: 'Sessões semanais cobertas pelo IMM',
        notes: 'Agendadas 6 sessões iniciais.',
      },
      {
        id: 't6',
        title: 'Incluir em grupo de apoio às mulheres',
        status: 'atrasada',
        responsible: 'Coordenação projetos',
        dueDate: '2024-07-15',
        support: 'Vagas reservadas no Círculo de Mulheres',
        notes: 'Aguardando disponibilidade de vaga.',
      },
    ],
  },
];

export function getActionPlanByBeneficiary(beneficiaryId: string) {
  return demoActionPlans.find((plan) => plan.beneficiaryId === beneficiaryId) ?? null;
}
