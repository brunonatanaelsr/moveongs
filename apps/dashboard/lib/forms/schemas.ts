import type { RJSFSchema, UiSchema } from '@rjsf/utils';

export type FormSchemaDefinition = {
  slug: string;
  title: string;
  description: string;
  schema: RJSFSchema;
  uiSchema?: UiSchema;
  recommendedPermissions: string[];
};

const dateWidget: UiSchema = {
  'ui:widget': 'date',
};

export const FORM_SCHEMAS: FormSchemaDefinition[] = [
  {
    slug: 'anamnese-social',
    title: 'Anamnese social',
    description:
      'Triagem inicial da beneficiária com dados civis, composição familiar, vulnerabilidades e histórico biopsicossocial.',
    recommendedPermissions: ['beneficiaries:create', 'forms:submit'],
    schema: {
      type: 'object',
      required: ['identificacao', 'contatos', 'vulnerabilidades'],
      properties: {
        identificacao: {
          type: 'object',
          title: 'Identificação',
          required: ['nomeCompleto', 'dataNascimento', 'bairro'],
          properties: {
            nomeCompleto: { type: 'string', title: 'Nome completo' },
            dataNascimento: { type: 'string', format: 'date', title: 'Data de nascimento' },
            cpf: { type: 'string', title: 'CPF' },
            rg: { type: 'string', title: 'RG' },
            nis: { type: 'string', title: 'NIS' },
            bairro: { type: 'string', title: 'Bairro' },
            referencia: { type: 'string', title: 'Ponto de referência' },
          },
        },
        contatos: {
          type: 'object',
          title: 'Contatos',
          properties: {
            telefonePrincipal: { type: 'string', title: 'Telefone principal' },
            telefoneAlternativo: { type: 'string', title: 'Telefone alternativo' },
            email: { type: 'string', title: 'E-mail' },
          },
        },
        composicaoFamiliar: {
          type: 'array',
          title: 'Composição familiar',
          items: {
            type: 'object',
            required: ['nome', 'parentesco'],
            properties: {
              nome: { type: 'string', title: 'Nome' },
              parentesco: { type: 'string', title: 'Parentesco' },
              idade: { type: 'number', title: 'Idade' },
              renda: { type: 'number', title: 'Renda mensal' },
              trabalha: { type: 'boolean', title: 'Trabalha atualmente?' },
            },
          },
        },
        vulnerabilidades: {
          type: 'array',
          title: 'Vulnerabilidades identificadas',
          uniqueItems: true,
          items: {
            type: 'string',
            enum: [
              'Insegurança alimentar',
              'Desemprego',
              'Violência doméstica',
              'Dependência química',
              'Pessoa com deficiência',
              'Gestante ou puérpera',
            ],
          },
        },
        historicoBiopsicossocial: {
          type: 'object',
          title: 'Histórico biopsicossocial',
          properties: {
            usoSubstancias: { type: 'string', title: 'Uso de substâncias' },
            saudeMental: { type: 'string', title: 'Saúde mental' },
            redeApoio: { type: 'string', title: 'Rede de apoio' },
            encaminhamentos: { type: 'string', title: 'Encaminhamentos prévios' },
          },
        },
        confirmacoes: {
          type: 'object',
          title: 'Confirmações',
          properties: {
            aceitaCompartilhamentoDados: { type: 'boolean', title: 'Autoriza compartilhamento de dados com parceiros?' },
            aceitaTermosInstituto: { type: 'boolean', title: 'Aceita os termos de participação do IMM?' },
          },
        },
      },
    },
    uiSchema: {
      identificacao: {
        dataNascimento: dateWidget,
      },
      composicaoFamiliar: {
        items: {
          idade: {
            'ui:widget': 'updown',
          },
          renda: {
            'ui:widget': 'updown',
          },
        },
      },
    },
  },
  {
    slug: 'inscricao-projeto',
    title: 'Inscrição em projeto',
    description: 'Formaliza a matrícula da beneficiária em um projeto ou oficina com aceite dos acordos de convivência.',
    recommendedPermissions: ['enrollments:create'],
    schema: {
      type: 'object',
      required: ['beneficiaria', 'projeto', 'acordos'],
      properties: {
        beneficiaria: {
          type: 'object',
          title: 'Beneficiária',
          required: ['nome', 'codigoMatricula'],
          properties: {
            nome: { type: 'string', title: 'Nome completo' },
            codigoMatricula: { type: 'string', title: 'Código de matrícula' },
            dataNascimento: { type: 'string', format: 'date', title: 'Data de nascimento' },
            contato: { type: 'string', title: 'Telefone ou e-mail' },
          },
        },
        projeto: {
          type: 'object',
          title: 'Projeto / Turma',
          required: ['nomeProjeto', 'diaSemana'],
          properties: {
            nomeProjeto: { type: 'string', title: 'Projeto' },
            turma: { type: 'string', title: 'Turma' },
            diaSemana: {
              type: 'string',
              title: 'Dia da semana',
              enum: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
            },
            horario: { type: 'string', title: 'Horário' },
            educadoraResponsavel: { type: 'string', title: 'Educadora responsável' },
          },
        },
        acordos: {
          type: 'array',
          title: 'Acordos de convivência',
          items: {
            type: 'object',
            required: ['descricao', 'aceite'],
            properties: {
              descricao: { type: 'string', title: 'Descrição do acordo' },
              aceite: { type: 'boolean', title: 'Aceito pela beneficiária' },
            },
          },
        },
        desligamentoSolicitado: {
          type: 'boolean',
          title: 'Solicitação de desligamento em andamento',
          default: false,
        },
        observacoes: {
          type: 'string',
          title: 'Observações adicionais',
        },
      },
    },
  },
  {
    slug: 'plano-acao',
    title: 'Plano de ação personalizado',
    description:
      'Define objetivos, ações, responsáveis, prazos e avaliações semestrais para acompanhamento individual.',
    recommendedPermissions: ['action-plans:write'],
    schema: {
      type: 'object',
      required: ['objetivoPrincipal', 'acoes'],
      properties: {
        objetivoPrincipal: { type: 'string', title: 'Objetivo principal' },
        areasPrioritarias: {
          type: 'array',
          title: 'Áreas prioritárias',
          uniqueItems: true,
          items: {
            type: 'string',
            enum: [
              'Saúde',
              'Educação',
              'Geração de renda',
              'Fortalecimento familiar',
              'Cidadania e direitos',
              'Desenvolvimento emocional',
            ],
          },
        },
        acoes: {
          type: 'array',
          title: 'Ações planejadas',
          items: {
            type: 'object',
            required: ['titulo', 'responsavel', 'prazo'],
            properties: {
              titulo: { type: 'string', title: 'Título da ação' },
              responsavel: { type: 'string', title: 'Responsável' },
              prazo: { type: 'string', format: 'date', title: 'Prazo' },
              suporteIMM: { type: 'string', title: 'Suporte do IMM' },
              status: {
                type: 'string',
                title: 'Status',
                enum: ['planejada', 'em_andamento', 'concluida', 'atrasada'],
                default: 'planejada',
              },
            },
          },
        },
        avaliacoes: {
          type: 'array',
          title: 'Avaliações semestrais',
          items: {
            type: 'object',
            properties: {
              data: { type: 'string', format: 'date', title: 'Data' },
              avaliadora: { type: 'string', title: 'Profissional responsável' },
              resumo: { type: 'string', title: 'Resumo da avaliação' },
            },
          },
        },
        assinaturaBeneficiaria: { type: 'string', title: 'Assinatura da beneficiária (nome completo)' },
        assinaturaTecnica: { type: 'string', title: 'Assinatura da técnica de referência' },
      },
    },
    uiSchema: {
      acoes: {
        items: {
          prazo: dateWidget,
        },
      },
      avaliacoes: {
        items: {
          data: dateWidget,
        },
      },
    },
  },
  {
    slug: 'registro-presenca',
    title: 'Registro de presenças',
    description:
      'Permite registrar presenças, ausências e justificativas por turma, mantendo histórico auditável.',
    recommendedPermissions: ['attendance:write'],
    schema: {
      type: 'object',
      required: ['turma', 'dataRegistro', 'participantes'],
      properties: {
        turma: { type: 'string', title: 'Turma' },
        dataRegistro: { type: 'string', format: 'date', title: 'Data do encontro' },
        participantes: {
          type: 'array',
          title: 'Participantes',
          items: {
            type: 'object',
            required: ['beneficiaria', 'status'],
            properties: {
              beneficiaria: { type: 'string', title: 'Beneficiária' },
              status: {
                type: 'string',
                title: 'Status',
                enum: ['presente', 'falta_justificada', 'falta_injustificada', 'atraso'],
              },
              justificativa: { type: 'string', title: 'Justificativa (opcional)' },
            },
          },
        },
        observacoesGerais: { type: 'string', title: 'Observações gerais' },
      },
    },
    uiSchema: {
      dataRegistro: dateWidget,
    },
  },
  {
    slug: 'consentimento-lgpd',
    title: 'Termo LGPD & uso de imagem',
    description:
      'Coleta autorização de uso de imagem e consentimento LGPD com trilha de auditoria de revogação.',
    recommendedPermissions: ['consents:write'],
    schema: {
      type: 'object',
      required: ['titular', 'responsavelLegal', 'autorizaImagem', 'finalidades'],
      properties: {
        titular: {
          type: 'object',
          title: 'Titular dos dados',
          required: ['nome', 'documento', 'dataAssinatura'],
          properties: {
            nome: { type: 'string', title: 'Nome completo' },
            documento: { type: 'string', title: 'Documento (CPF/RG)' },
            dataAssinatura: { type: 'string', format: 'date', title: 'Data de assinatura' },
            localAssinatura: { type: 'string', title: 'Local' },
          },
        },
        responsavelLegal: {
          type: 'object',
          title: 'Responsável legal (quando aplicável)',
          properties: {
            nome: { type: 'string', title: 'Nome completo' },
            documento: { type: 'string', title: 'Documento' },
            relacao: { type: 'string', title: 'Relação com a beneficiária' },
          },
        },
        autorizaImagem: { type: 'boolean', title: 'Autoriza uso de imagem do titular?' },
        canaisAutorizados: {
          type: 'array',
          title: 'Canais autorizados',
          items: {
            type: 'string',
            enum: ['Redes sociais', 'Materiais impressos', 'Relatórios públicos', 'Eventos'],
          },
          uniqueItems: true,
        },
        finalidades: {
          type: 'array',
          title: 'Finalidades de tratamento dos dados',
          items: {
            type: 'string',
            enum: [
              'Execução de projeto socioassistencial',
              'Prestação de contas e relatórios',
              'Captação de recursos',
              'Comunicação institucional',
            ],
          },
        },
        canalRevogacao: { type: 'string', title: 'Canal para revogação', default: 'contato@movemarias.org' },
        aceiteLGPD: { type: 'boolean', title: 'Declara ciência dos direitos do titular previstos na LGPD?' },
      },
    },
    uiSchema: {
      titular: {
        dataAssinatura: dateWidget,
      },
    },
  },
];

export const FORM_SCHEMA_MAP = Object.fromEntries(FORM_SCHEMAS.map((definition) => [definition.slug, definition]));
