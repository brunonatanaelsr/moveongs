import { type FormSchema } from '../types/operations';

export const FORM_SCHEMAS: FormSchema[] = [
  {
    id: 'form.anamnese_social',
    version: 'v1',
    title: 'Anamnese Social',
    category: 'anamnese',
    description:
      'Coleta estruturada de dados socioeconômicos, vulnerabilidades e contexto familiar da beneficiária.',
    sections: [
      {
        id: 'identificacao',
        title: 'Identificação e contatos',
        fields: [
          { id: 'data_atendimento', label: 'Data do atendimento', type: 'date', required: true },
          { id: 'nome', label: 'Nome completo', type: 'text', required: true },
          { id: 'idade', label: 'Idade', type: 'number', required: true },
          { id: 'endereco', label: 'Endereço completo', type: 'textarea', required: true },
          { id: 'bairro', label: 'Bairro', type: 'text', required: true },
          { id: 'referencia', label: 'Ponto de referência', type: 'text' },
          {
            id: 'nis',
            label: 'Número do NIS',
            type: 'text',
          },
          {
            id: 'contatos',
            label: 'Telefones para contato',
            type: 'multi-text',
            multiTextConfig: { addLabel: 'Adicionar contato', emptyLabel: 'Nenhum contato adicionado.' },
          },
          { id: 'rg', label: 'RG (número e órgão emissor)', type: 'text', required: true },
          { id: 'cpf', label: 'CPF', type: 'text', required: true },
        ],
      },
      {
        id: 'composicao_familiar',
        title: 'Composição familiar',
        description: 'Informe os membros que residem com a beneficiária e a contribuição de renda.',
        repeatable: true,
        itemLabel: 'Membro da família',
        fields: [
          { id: 'nome', label: 'Nome completo', type: 'text', required: true },
          { id: 'data_nascimento', label: 'Data de nascimento', type: 'date', required: true },
          { id: 'parentesco', label: 'Parentesco', type: 'text', required: true },
          {
            id: 'trabalha',
            label: 'Trabalha?',
            type: 'select',
            options: [
              { label: 'Sim', value: 'sim' },
              { label: 'Não', value: 'nao' },
            ],
            required: true,
          },
          { id: 'renda', label: 'Renda mensal aproximada (R$)', type: 'number' },
        ],
      },
      {
        id: 'biopsicossocial',
        title: 'Dimensão biopsicossocial',
        fields: [
          {
            id: 'uso_alcool',
            label: 'Uso de álcool',
            type: 'select',
            options: [
              { label: 'Não', value: 'nao' },
              { label: 'Ocasional', value: 'ocasional' },
              { label: 'Frequente', value: 'frequente' },
            ],
          },
          { id: 'uso_drogas', label: 'Uso de outras substâncias', type: 'textarea' },
          { id: 'transtornos', label: 'Transtornos diagnosticados', type: 'textarea' },
          { id: 'deficiencia', label: 'Deficiência', type: 'textarea' },
          { id: 'doencas_cronicas', label: 'Doenças crônicas', type: 'textarea' },
          { id: 'desafios', label: 'Principais desafios relatados', type: 'textarea' },
        ],
      },
      {
        id: 'vulnerabilidades',
        title: 'Vulnerabilidades identificadas',
        fields: [
          {
            id: 'vulnerabilidades',
            label: 'Selecione as vulnerabilidades',
            type: 'checkbox-group',
            options: [
              { label: 'Situação de desemprego', value: 'desemprego' },
              { label: 'Renda instável', value: 'renda_instavel' },
              { label: 'Pessoa idosa sob cuidado', value: 'idoso' },
              { label: 'Pessoa com deficiência', value: 'pcd' },
              { label: 'Dependência química', value: 'dependencia' },
              { label: 'Família monoparental', value: 'monoparental' },
            ],
          },
          {
            id: 'confirmacoes',
            label: 'Confirmo que as informações são verdadeiras',
            type: 'checkbox',
            required: true,
          },
          {
            id: 'assinatura',
            label: 'Assinatura da beneficiária ou responsável',
            type: 'signature',
            required: true,
          },
        ],
      },
    ],
  },
  {
    id: 'form.declaracao_recibo',
    version: 'v1',
    title: 'Declaração & Recibo',
    category: 'declaracao_recibo',
    description: 'Declaração de comparecimento e recibo de benefício.',
    sections: [
      {
        id: 'declaracao',
        title: 'Declaração de comparecimento',
        fields: [
          { id: 'cpf', label: 'CPF da beneficiária', type: 'text', required: true },
          { id: 'local', label: 'Local da atividade', type: 'text', required: true },
          { id: 'data', label: 'Data', type: 'date', required: true },
          { id: 'hora_inicio', label: 'Hora de início', type: 'text', required: true },
          { id: 'hora_fim', label: 'Hora de término', type: 'text', required: true },
          { id: 'responsavel', label: 'Profissional responsável', type: 'text', required: true },
        ],
      },
      {
        id: 'recibo',
        title: 'Recibo de benefício',
        fields: [
          { id: 'descricao_beneficio', label: 'Descrição do benefício', type: 'textarea', required: true },
          { id: 'assinatura', label: 'Assinatura da beneficiária', type: 'signature', required: true },
        ],
      },
    ],
  },
  {
    id: 'form.ficha_evolucao',
    version: 'v1',
    title: 'Ficha de Evolução',
    category: 'evolucao',
    description: 'Registro cronológico da evolução, movimentações e responsáveis.',
    sections: [
      {
        id: 'cabecalho',
        title: 'Identificação',
        fields: [
          { id: 'beneficiaria', label: 'Beneficiária', type: 'text', required: true },
          { id: 'programa', label: 'Programa/Serviço', type: 'text', required: true },
          { id: 'data_inicio', label: 'Data de início do acompanhamento', type: 'date', required: true },
        ],
      },
      {
        id: 'registros',
        title: 'Registros datados',
        repeatable: true,
        itemLabel: 'Registro',
        fields: [
          { id: 'data', label: 'Data', type: 'date', required: true },
          { id: 'descricao', label: 'Descrição da evolução', type: 'textarea', required: true },
          { id: 'responsavel', label: 'Responsável', type: 'text', required: true },
        ],
      },
    ],
  },
  {
    id: 'form.inscricao_projeto',
    version: 'v1',
    title: 'Inscrição em Projeto',
    category: 'inscricao',
    description: 'Fluxo para matrícula em projetos, acordos e desligamentos.',
    sections: [
      {
        id: 'identificacao',
        title: 'Identificação',
        fields: [
          { id: 'nome', label: 'Nome da beneficiária', type: 'text', required: true },
          { id: 'data_nascimento', label: 'Data de nascimento', type: 'date', required: true },
          { id: 'contato', label: 'Contato telefônico', type: 'text', required: true },
          { id: 'codigo_matricula', label: 'Código de matrícula', type: 'text', required: true },
        ],
      },
      {
        id: 'dados_projeto',
        title: 'Dados do projeto',
        fields: [
          { id: 'projeto', label: 'Projeto', type: 'text', required: true },
          { id: 'turma', label: 'Turma/Dia da semana', type: 'text', required: true },
          { id: 'turno', label: 'Turno', type: 'text', required: true },
          { id: 'horario', label: 'Horário', type: 'text', required: true },
        ],
      },
      {
        id: 'acordos',
        title: 'Acordos de convivência',
        fields: [
          {
            id: 'acordos',
            label: 'Aceite dos acordos de convivência',
            type: 'checkbox',
            required: true,
          },
        ],
      },
      {
        id: 'desligamento',
        title: 'Solicitação de desligamento (se aplicável)',
        fields: [
          {
            id: 'desligamento',
            label: 'Deseja registrar um desligamento?',
            type: 'select',
            options: [
              { label: 'Não', value: 'nao' },
              { label: 'Sim', value: 'sim' },
            ],
          },
          { id: 'motivo', label: 'Motivo do desligamento', type: 'textarea' },
          { id: 'assinatura', label: 'Assinatura', type: 'signature' },
        ],
      },
    ],
  },
  {
    id: 'form.consentimentos',
    version: 'v1',
    title: 'Consentimentos LGPD & Uso de imagem',
    category: 'consentimento',
    description: 'Registro de autorizações obrigatórias conforme LGPD.',
    sections: [
      {
        id: 'dados_civis',
        title: 'Dados civis',
        fields: [
          { id: 'nome', label: 'Nome completo', type: 'text', required: true },
          { id: 'cpf', label: 'CPF', type: 'text', required: true },
          { id: 'responsavel', label: 'Responsável legal (quando aplicável)', type: 'text' },
        ],
      },
      {
        id: 'lgpd',
        title: 'Termo LGPD',
        fields: [
          {
            id: 'finalidades',
            label: 'Finalidades autorizadas',
            type: 'checkbox-group',
            options: [
              { label: 'Atendimento socioassistencial', value: 'atendimento' },
              { label: 'Produção de relatórios', value: 'relatorios' },
              { label: 'Compartilhamento com parceiros', value: 'parceiros' },
            ],
            required: true,
          },
          {
            id: 'direitos',
            label: 'Declaro estar ciente dos meus direitos como titular de dados',
            type: 'checkbox',
            required: true,
          },
        ],
      },
      {
        id: 'imagem',
        title: 'Autorização de uso de imagem',
        fields: [
          {
            id: 'abrangencia',
            label: 'Abrangência autorizada',
            type: 'select',
            options: [
              { label: 'Somente interno', value: 'interno' },
              { label: 'Redes sociais IMM', value: 'redes' },
              { label: 'Parceiros e imprensa', value: 'parceiros' },
            ],
          },
          {
            id: 'prazo',
            label: 'Prazo de validade da autorização',
            type: 'select',
            options: [
              { label: '1 ano', value: '1ano' },
              { label: '2 anos', value: '2anos' },
              { label: 'Até revogação', value: 'indeterminado' },
            ],
          },
        ],
      },
      {
        id: 'assinaturas',
        title: 'Assinaturas',
        fields: [
          { id: 'assinatura_beneficiaria', label: 'Assinatura da beneficiária', type: 'signature', required: true },
          { id: 'assinatura_responsavel', label: 'Assinatura do responsável', type: 'signature' },
        ],
      },
    ],
  },
  {
    id: 'form.visao_holistica',
    version: 'v1',
    title: 'Visão Holística',
    category: 'visao_holistica',
    description: 'Resumo qualitativo e encaminhamentos elaborados pela técnica de referência.',
    sections: [
      {
        id: 'historia',
        title: 'História de vida',
        fields: [
          { id: 'historia', label: 'Resumo da história de vida', type: 'textarea', required: true },
          { id: 'rede_apoio', label: 'Rede de apoio', type: 'textarea', required: true },
        ],
      },
      {
        id: 'analise',
        title: 'Análise técnica',
        fields: [
          { id: 'visao_tecnica', label: 'Visão da técnica de referência', type: 'textarea', required: true },
          { id: 'encaminhamento', label: 'Encaminhamento ao projeto', type: 'textarea', required: true },
          { id: 'data', label: 'Data da avaliação', type: 'date', required: true },
          { id: 'assinatura', label: 'Assinatura da técnica', type: 'signature', required: true },
        ],
      },
    ],
  },
  {
    id: 'form.plano_acao',
    version: 'v1',
    title: 'Plano de Ação Personalizado',
    category: 'plano_acao',
    description: 'Definição de objetivos, ações, responsáveis e suporte do instituto.',
    sections: [
      {
        id: 'objetivo',
        title: 'Objetivo e prioridades',
        fields: [
          { id: 'objetivo_principal', label: 'Objetivo principal', type: 'textarea', required: true },
          {
            id: 'areas_prioritarias',
            label: 'Áreas prioritárias',
            type: 'checkbox-group',
            options: [
              { label: 'Renda e trabalho', value: 'renda' },
              { label: 'Educação', value: 'educacao' },
              { label: 'Saúde física', value: 'saude' },
              { label: 'Saúde mental', value: 'saude_mental' },
              { label: 'Rede de apoio', value: 'rede_apoio' },
            ],
          },
        ],
      },
      {
        id: 'acoes',
        title: 'Ações planejadas',
        repeatable: true,
        itemLabel: 'Ação',
        fields: [
          { id: 'descricao', label: 'Descrição da ação', type: 'textarea', required: true },
          { id: 'responsavel', label: 'Responsável', type: 'text', required: true },
          { id: 'prazo', label: 'Prazo', type: 'date', required: true },
          {
            id: 'status',
            label: 'Status',
            type: 'select',
            options: [
              { label: 'Pendente', value: 'pendente' },
              { label: 'Em andamento', value: 'em_andamento' },
              { label: 'Concluída', value: 'concluida' },
            ],
            required: true,
          },
          { id: 'suporte', label: 'Suporte do instituto', type: 'textarea' },
        ],
      },
      {
        id: 'avaliacoes',
        title: 'Avaliações periódicas',
        repeatable: true,
        itemLabel: 'Avaliação',
        fields: [
          { id: 'data', label: 'Data', type: 'date', required: true },
          { id: 'resumo', label: 'Resumo da avaliação', type: 'textarea', required: true },
          { id: 'pontuacao', label: 'Pontuação (0-10)', type: 'number' },
        ],
      },
    ],
  },
  {
    id: 'form.roda_da_vida',
    version: 'v1',
    title: 'Roda da Vida',
    category: 'roda_da_vida',
    description: 'Autoavaliação das áreas da vida em escala de 1 a 10.',
    sections: [
      {
        id: 'pontuacoes',
        title: 'Avaliação por área',
        fields: [
          { id: 'qualidade_de_vida', label: 'Qualidade de vida', type: 'rating', required: true },
          { id: 'relacionamentos', label: 'Relacionamentos', type: 'rating', required: true },
          { id: 'vida_profissional', label: 'Vida profissional', type: 'rating', required: true },
          { id: 'lazer', label: 'Lazer', type: 'rating', required: true },
          { id: 'espiritualidade', label: 'Espiritualidade', type: 'rating', required: true },
          { id: 'tempo_qualidade', label: 'Tempo de qualidade', type: 'rating', required: true },
          { id: 'saude', label: 'Saúde', type: 'rating', required: true },
          { id: 'equilibrio_emocional', label: 'Equilíbrio emocional', type: 'rating', required: true },
          { id: 'recursos_financeiros', label: 'Recursos financeiros', type: 'rating', required: true },
          { id: 'carreira', label: 'Carreira', type: 'rating', required: true },
          { id: 'contribuicao_social', label: 'Contribuição social', type: 'rating', required: true },
          { id: 'familia', label: 'Família', type: 'rating', required: true },
          { id: 'amor', label: 'Amor', type: 'rating', required: true },
          { id: 'vida_social', label: 'Vida social', type: 'rating', required: true },
        ],
      },
      {
        id: 'data',
        title: 'Referências',
        fields: [
          { id: 'data_avaliacao', label: 'Data da avaliação', type: 'date', required: true },
          { id: 'observacoes', label: 'Observações adicionais', type: 'textarea' },
        ],
      },
    ],
  },
];
