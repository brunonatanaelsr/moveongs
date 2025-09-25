export type ConsentStatus = 'pendente' | 'assinado' | 'revogado';

export interface ConsentRecord {
  id: string;
  type: string;
  version: string;
  status: ConsentStatus;
  signedAt?: string;
  expiresAt?: string;
  collectedBy?: string;
}

export interface TimelineEvent {
  id: string;
  date: string;
  type:
    | 'formulario'
    | 'matricula'
    | 'frequencia'
    | 'plano_acao'
    | 'mensagem'
    | 'consentimento'
    | 'atendimento';
  title: string;
  description: string;
  actor: string;
  tags?: string[];
}

export interface ActionItem {
  id: string;
  description: string;
  responsible: string;
  dueDate: string;
  status: 'pendente' | 'em_andamento' | 'concluida' | 'atrasada';
  support?: string;
}

export interface ActionPlan {
  id: string;
  updatedAt: string;
  goal: string;
  priorityAreas: string[];
  items: ActionItem[];
  evaluations: { date: string; summary: string; score?: number }[];
}

export interface AttendanceRecord {
  id: string;
  date: string;
  status: 'presente' | 'ausente' | 'justificado';
  justification?: string;
  recordedBy: string;
}

export interface EnrollmentRecord {
  id: string;
  projectId: string;
  classroomId: string;
  startDate: string;
  status: 'ativa' | 'pendente' | 'concluida' | 'desligada';
  agreementsAccepted: boolean;
  disengagement?: {
    date: string;
    reason: string;
    notes?: string;
  };
}

export interface HouseholdMember {
  id: string;
  name: string;
  birthDate: string;
  relation: string;
  works: boolean;
  income: number;
}

export interface BeneficiaryProfile {
  id: string;
  name: string;
  code: string;
  birthDate: string;
  phone: string;
  email?: string;
  address: string;
  neighborhood: string;
  status: 'ativa' | 'risco' | 'em_triagem' | 'desligada';
  vulnerabilities: string[];
  documents: { rg: string; cpf: string; nis?: string };
  household: HouseholdMember[];
  socioeconomicNotes?: string;
  actionPlan: ActionPlan;
  timeline: TimelineEvent[];
  consents: ConsentRecord[];
  enrollments: EnrollmentRecord[];
  attendance: Record<string, AttendanceRecord[]>;
}

export interface Classroom {
  id: string;
  name: string;
  schedule: string;
  capacity: number;
  location: string;
  educator: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  focus: string;
  cohorts: Classroom[];
  capacity: number;
  activeEnrollments: number;
  riskAlerts: number;
  attendanceRate: number;
}

export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'select'
  | 'checkbox'
  | 'checkbox-group'
  | 'signature'
  | 'rating'
  | 'multi-text';

export interface FormField {
  id: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  placeholder?: string;
  options?: { label: string; value: string }[];
  helperText?: string;
  multiTextConfig?: {
    addLabel: string;
    emptyLabel: string;
  };
}

export interface FormSection {
  id: string;
  title: string;
  description?: string;
  fields: FormField[];
  repeatable?: boolean;
  itemLabel?: string;
}

export interface FormSchema {
  id: string;
  version: string;
  title: string;
  category:
    | 'anamnese'
    | 'declaracao_recibo'
    | 'evolucao'
    | 'inscricao'
    | 'consentimento'
    | 'visao_holistica'
    | 'plano_acao'
    | 'roda_da_vida';
  description: string;
  sections: FormSection[];
}

export interface FormSubmission {
  id: string;
  schemaId: string;
  schemaVersion: string;
  submittedAt: string;
  submittedBy: string;
  status: 'rascunho' | 'enviado';
  payload: Record<string, unknown>;
}
