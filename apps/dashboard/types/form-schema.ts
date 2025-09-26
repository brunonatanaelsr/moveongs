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

export type FormField = {
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
};

export type FormSection = {
  id: string;
  title: string;
  description?: string;
  fields: FormField[];
  repeatable?: boolean;
  itemLabel?: string;
};

export type FormSchema = {
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
};
