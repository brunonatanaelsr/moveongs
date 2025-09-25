# Instituto Move Marias (IMM)

# Sistema de Gestão de Beneficiárias — Especificação Funcional & Técnica v0.1

> Objetivo: entregar um “mini-ERP social” para o IMM: cadastro e acompanhamento de beneficiárias, formulários padronizados, evolução/atendimentos, inscrição em projetos, plano de ação, roda da vida, visão holística, termos/consentimentos (LGPD), mensagens internas, feed institucional, permissões avançadas, relatórios e auditoria.

---

## 1) Visão Geral

* **Público-alvo**: equipe técnica, educadoras, coordenação, voluntárias, administrativas e (opcional) acesso restrito para beneficiárias visualizarem agenda/recibos/planos.
* **Contexto**: centralizar o ciclo completo: triagem → cadastro → avaliação/entrevistas → inscrição em projetos → execução/assistência → evolução → registros/assinaturas → relatórios.
* **Pilares**: (a) **Dados estruturados** dos formulários oficiais do IMM; (b) **Rastreabilidade** (LGPD + trilha de auditoria); (c) **Comunicação** (mensagens internas + feed); (d) **Medição** (dashboards/relatórios); (e) **Escalabilidade** multi-projetos.

---

## 2) Módulos Funcionais

1. **Autenticação & RBAC**

   * Login por e-mail/senha (futuro: SSO). Recuperação de senha.
   * Perfis/Grupos: *Admin*, *Coordenação*, *Técnica de Referência*, *Educadora Social*, *Atendimento/Recepção*, *Voluntária*, *Financeiro/Adm*, *Leitura Externa (auditoria/pesquisa)* e *Beneficiária (visualização opcional)*.
   * Permissões detalhadas por recurso/ação; delegação por projeto.

2. **Cadastro de Beneficiárias**

   * Dados civis e de contato; documentos (RG/CPF/NIS); endereço; composição familiar; situação socioeconômica; vulnerabilidades.
   * Upload de anexos (selfies de documentos, comprovantes, laudos); campo de consentimentos (LGPD/uso de imagem).
   * Histórico de alterações + versão ativa (auditoria).

3. **Formulários Padronizados (Forms Service)**

   * **Anamnese Social**, **Declarações & Recibos**, **Ficha de Evolução**, **Inscrições em Projetos**, **TCLE/LGPD & Autorização de Imagem**, **Visão Holística**, **Plano de Ação Personalizado**, **Roda da Vida**.
   * Renderização dinâmica (schema-driven); coleta de assinaturas (na tela ou upload); exportação PDF.

4. **Projetos/Oficinas**

   * Cadastro de projetos, turmas, dias/turnos/horários, capacidade, educadoras responsáveis.
   * **Inscrição/Desligamento** com aceite de acordos de convivência.
   * Controle de frequência/assiduidade (meta ≥ 75%), justificativas, certificados.

5. **Evolução e Atendimentos**

   * Linha do tempo por beneficiária (movimentações, interações, visitas, ausências, retornos, feedbacks).
   * Tarefas e compromissos vinculados ao **Plano de Ação** (com prazos, responsáveis e status).

6. **Mensagens Internas**

   * DM e conversas em grupo por beneficiária/projeto (threads), menções, anexos, busca.
   * Regras de retenção e classificação (sensível, confidencial, público interno).

7. **Feed Institucional**

   * Postagens da coordenação/projetos: comunicados, oportunidades, agenda.
   * Comentários e reações; segmentação por projeto ou geral.

8. **Relatórios & Dashboards**

   * Indicadores: total de beneficiárias ativas, inscrições por projeto, assiduidade, evolução de metas, distribuição de vulnerabilidades, atendimentos por período, status de consentimentos.
   * Exportações: CSV/XLSX, PDF; integrações com BI (futuro).

9. **Administração**

   * Cadastros mestres: usuários, perfis, projetos, oficinas, motivos de desligamento, tipos de benefício/recibo, taxonomias (vulnerabilidades, deficiências, doenças crônicas etc.).
   * Auditoria, backups, parâmetros (LGPD, retenção, políticas de senha).

---

## 3) Domínio & Modelo de Dados (ERD de alto nível)

**Entidades principais**

* `Beneficiary` (1)—(N) `HouseholdMember`
* `Beneficiary` (1)—(N) `VulnerabilityTag` (via `BeneficiaryVulnerability`)
* `Beneficiary` (1)—(N) `FormSubmission` (tipos: Anamnese, Declaração, Evolução, Inscrição, TCLE/Imagem, Visão Holística, Plano de Ação, Roda da Vida)
* `Project` (1)—(N) `Classroom`/`Cohort` (turmas) (1)—(N) `Enrollment`
* `Enrollment` (1)—(N) `Attendance`
* `ActionPlan` (1)—(N) `ActionItem`
* `User` (N)—(N) `Role` (via `UserRole`), escopado por `Project` quando aplicável
* `MessageThread` (1)—(N) `Message`
* `Post` (Feed) (1)—(N) `Comment`
* `Consent` (LGPD/Imagem) vinculado a `Beneficiary`
* `AuditLog`
* `Attachment` vinculado a várias entidades (polimórfico)

**Observações**

* `FormSubmission` guarda um **JSON schema + payload** para cada formulário, permitindo versão dos templates e retrocompatibilidade.
* `Consent` registra propósito, base legal, data, versão do texto e evidências (assinatura, IP, dispositivo).

---

## 4) Especificações de Formulários (Schemas)

> Os campos foram mapeados para JSON Schemas versionados. Cada submissão referencia `schema_version` + carimbo de tempo + assinaturas.

### 4.1 Anamnese Social — `form.anamnese_social.v1`

Campos-chave: identificação (data, nome, idade, endereço, bairro, referência, NIS, contatos, RG/órgão emissor/data de emissão, CPF); **Situação socioeconômica familiar** (lista de membros: nome, data nasc., idade, trabalha S/N, renda); **Biopsicossocial** (uso de álcool/drogas/cigarros/outros; transtornos; deficiência; dependentes; doenças crônicas; desafios); **Vulnerabilidades** (NIS, desemprego, instabilidade, dependências, criança/adolescente, idosos, PcD); confirmações e assinaturas.

### 4.2 Declaração & Recibo — `form.declaracao_recibo.v1`

* Declaração de comparecimento (campos: CPF, PAEDI, local, data, hora início/fim, carimbo/assinatura da profissional).
* Recibo de benefício (campos: CPF, PAEDI, descrição do benefício, data, assinatura da usuária).

### 4.3 Ficha de Evolução — `form.ficha_evolucao.v1`

* Cabeçalho (beneficiária, data de nasc., data de início, programa/oficina/serviço).
* **Registros datados** de evolução/movimentação, com responsável e espaço para assinaturas quando necessário.

### 4.4 Inscrições em Projetos — `form.inscricao_projeto.v1`

* Identificação da beneficiária (nome, data nasc., idade, contato, código de matrícula).
* Dados do projeto (nome, dia da semana, turno, horário).
* **Acordos de convivência** (itens com aceite), **Solicitação de desligamento** com texto padrão e assinatura.

### 4.5 TCLE & Autorização de Imagem — `form.consentimentos.v1`

* Autorização de uso de imagem (dados civis + aceite abrangência/veículos).
* Termo LGPD: bases legais, direitos do titular, finalidades, prazos, revogação.
* Assinaturas: voluntária e, quando aplicável, responsável familiar.

### 4.6 Visão Holística — `form.visao_holistica.v1`

* História de vida (texto), Rede de apoio (texto), Visão da técnica de referência, encaminhamento ao projeto (data, assinatura técnica).

### 4.7 Plano de Ação Personalizado — `form.plano_acao.v1`

* Objetivo principal, áreas prioritárias (checkboxes), **ações a serem realizadas**, **suporte do instituto**, avaliações semestrais, assinaturas.

### 4.8 Roda da Vida — `form.roda_da_vida.v1`

* Pontuações 1–10 para cada área (qualidade de vida, felicidade pessoal, relacionamentos, profissional, lazer, espiritualidade, tempo de qualidade, saúde, equilíbrio emocional, recursos financeiros, carreira, contribuição social, família, amor, vida social), data.

**Observação**: todos os formulários aceitam **anexos** e **assinatura digital** (desenho, nome digitado com selo de tempo, ou upload do papel assinado).

---

## 5) Regras de Negócio & Fluxos

* **Assiduidade mínima**: presença ≥ 75% por turma (com tolerância configurável); sinalizar risco abaixo desse patamar.
* **Consentimentos obrigatórios**: LGPD e, quando houver uso de imagem, sem consentimento não permitir publicação/compartilhamento.
* **Plano de Ação**: cada ação tem *responsável, prazo e status*; atrasos geram alerta na timeline da beneficiária.
* **Desligamento**: exige motivo + texto padrão + assinatura; bloqueia novas presenças e exibe banner no perfil.
* **Auditoria**: qualquer atualização de campos sensíveis grava `AuditLog` (quem, quando, de→para, justificativa opcional).
* **Mensagens**: threads por beneficiária e por projeto; marcação de confidencialidade (acesso restrito a perfis autorizados).

**Fluxo macro**

1. Recepção cria **Beneficiária** + **Anamnese** →
2. Técnica aplica **Visão Holística** + **Roda da Vida** →
3. Inscrição em **Projeto/Turma** com **Acordos** →
4. Execução: **Evolução**, **Plano de Ação**, **Frequência** →
5. Relatórios, Declarações/Recibos, eventual **Desligamento**.

---

## 6) API (REST) — Contratos Essenciais (OpenAPI sketch)

```yaml
openapi: 3.0.3
info:
  title: IMM API
  version: 0.1.0
servers:
  - url: /api
paths:
  /auth/login: { post: { requestBody: { ... }, responses: { '200': { description: OK }}}}
  /users: { get: { security: [bearerAuth: []]}, post: { ... }}
  /roles: { get: {}, post: {} }
  /beneficiaries: { get: {}, post: {} }
  /beneficiaries/{id}: { get: {}, patch: {}, delete: {} }
  /beneficiaries/{id}/household: { get: {}, post: {} }
  /beneficiaries/{id}/consents: { get: {}, post: {} }
  /beneficiaries/{id}/forms: { get: {}, post: {} }
  /forms/{submissionId}: { get: {}, patch: {} }
  /projects: { get: {}, post: {} }
  /projects/{id}/cohorts: { get: {}, post: {} }
  /enrollments: { get: {}, post: {} }
  /enrollments/{id}/attendance: { post: {} }
  /action-plans: { post: {} }
  /action-plans/{id}/items: { post: {}, patch: {} }
  /evolutions: { get: {}, post: {} }
  /threads: { get: {}, post: {} }
  /threads/{id}/messages: { get: {}, post: {} }
  /feed/posts: { get: {}, post: {} }
  /feed/posts/{id}/comments: { post: {} }
  /reports/{slug}: { get: {} }
  /files: { post: {} }
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```

**Padrões**

* Respostas paginadas (cursor/limit). Filtros por projeto, período, status.
* Webhooks para eventos chave (ex.: `enrollment.created`, `attendance.recorded`, `consent.revoked`).

---

## 7) Banco de Dados (PostgreSQL — esquema base)

```sql
-- Usuários e papéis
create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  password_hash text not null,
  is_active boolean default true,
  created_at timestamptz default now()
);
create table roles (
  id serial primary key,
  slug text unique not null,
  name text not null
);
create table user_roles (
  user_id uuid references users(id) on delete cascade,
  role_id int references roles(id) on delete cascade,
  project_id uuid null,
  primary key (user_id, role_id, project_id)
);

-- Beneficiárias e núcleo familiar
create table beneficiaries (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  full_name text not null,
  birth_date date,
  cpf text,
  rg text,
  rg_issuer text,
  rg_issue_date date,
  nis text,
  phone1 text,
  phone2 text,
  address text,
  neighborhood text,
  reference text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table household_members (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid references beneficiaries(id) on delete cascade,
  name text,
  birth_date date,
  works boolean,
  income numeric(12,2)
);
create table vulnerabilities (
  id serial primary key,
  slug text unique,
  label text
);
create table beneficiary_vulnerabilities (
  beneficiary_id uuid references beneficiaries(id) on delete cascade,
  vulnerability_id int references vulnerabilities(id) on delete cascade,
  primary key (beneficiary_id, vulnerability_id)
);

-- Formulários (schema + payload)
create table form_submissions (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid references beneficiaries(id) on delete cascade,
  form_type text not null, -- ex.: anamnese_social
  schema_version text not null,
  payload jsonb not null,
  signed_by text[],
  signed_at timestamptz[],
  created_by uuid references users(id),
  created_at timestamptz default now()
);

-- Projetos/turmas e inscrições
create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  active boolean default true
);
create table cohorts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  weekday smallint,
  shift text, -- manhã/tarde/noite
  start_time time,
  end_time time,
  capacity int
);
create table enrollments (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid references beneficiaries(id) on delete cascade,
  cohort_id uuid references cohorts(id) on delete restrict,
  status text not null default 'active', -- active|suspended|terminated
  enrolled_at date not null default current_date,
  terminated_at date,
  termination_reason text
);
create table attendance (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid references enrollments(id) on delete cascade,
  date date not null,
  present boolean not null,
  justification text
);

-- Plano de Ação & Evolução
create table action_plans (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid references beneficiaries(id) on delete cascade,
  created_by uuid references users(id),
  created_at timestamptz default now()
);
create table action_items (
  id uuid primary key default gen_random_uuid(),
  action_plan_id uuid references action_plans(id) on delete cascade,
  title text not null,
  responsible text,
  due_date date,
  status text default 'pending',
  support text
);
create table evolutions (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid references beneficiaries(id) on delete cascade,
  date date not null,
  description text not null,
  responsible text
);

-- Mensagens e Feed
create table threads (
  id uuid primary key default gen_random_uuid(),
  scope text not null, -- beneficiary:{id} | project:{id} | general
  created_by uuid references users(id),
  created_at timestamptz default now()
);
create table messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references threads(id) on delete cascade,
  author_id uuid references users(id),
  body text not null,
  created_at timestamptz default now(),
  visibility text default 'internal' -- internal|confidential|public-internal
);
create table posts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid null references projects(id) on delete set null,
  author_id uuid references users(id),
  title text,
  body text,
  created_at timestamptz default now()
);
create table comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade,
  author_id uuid references users(id),
  body text,
  created_at timestamptz default now()
);

-- Consents & Auditoria
create table consents (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid references beneficiaries(id) on delete cascade,
  type text not null, -- lgpd|image
  text_version text not null,
  granted boolean not null,
  granted_at timestamptz not null,
  revoked_at timestamptz,
  evidence jsonb -- IP, userAgent, assinatura
);
create table audit_logs (
  id bigserial primary key,
  user_id uuid,
  entity text,
  entity_id uuid,
  action text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz default now()
);

-- Anexos genéricos
create table attachments (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null, -- beneficiary|form_submission|message|post|evolution
  owner_id uuid not null,
  file_path text not null,
  mime_type text,
  uploaded_by uuid references users(id),
  created_at timestamptz default now()
);
```

---

## 8) Regras de Permissão (RBAC — Matriz)

| Recurso | Admin | Coordenação | Técnica | Educadora | Recepção | Voluntária | Financeiro | Beneficiária |
| -------------------- | ------- | ----------- | ------- | --------------------- | -------- | ---------- | ---------- | ------------- |
| Beneficiárias (CRUD) | C/R/U/D | R/U/D | C/R/U | R | C/R | R | R | R (próprio\*) |
| Formulários | C/R/U/D | R/U/D | C/R/U/D | R (parciais) | C/R | R | R | R (próprio\*) |
| Projetos/Turmas | C/R/U/D | C/R/U/D | R | R | R | R | R | R |
| Inscrições/Presenças | C/R/U/D | C/R/U/D | C/R/U/D | C/R/U/D (suas turmas) | C/R | R | R | R (próprio\*) |
| Mensagens | C/R/U/D | C/R/U/D | C/R/U/D | C/R/U/D | C/R | R | R | — |
| Feed | C/R/U/D | C/R/U/D | C/R | C/R | R | R | R | R |
| Relatórios | C/R/U/D | C/R/U/D | R | R | R | — | R | — |
| Admin/RBAC | C/R/U/D | R | — | — | — | — | — | — |

> \*Acesso da beneficiária é opcional, somente leitura de documentos próprios e agenda/recibos.

---

## 9) LGPD & Segurança

* **Bases legais**: consentimento para uso de imagem; **execução de políticas públicas/legítimo interesse** para dados mínimos operacionais; minimização por finalidade.
* **Catálogo de dados** por formulário; labels de sensibilidade (biopsicossocial, saúde) com controle de acesso reforçado.
* **Trilha de auditoria** completa e exportável; relatório de atividades do titular.
* **Direitos do titular**: painel para *acesso/retificação/portabilidade/exclusão* (respeitando obrigações legais de retenção).
* **Criptografia** at-rest (disk/column para campos sensíveis) e in-transit (HTTPS/TLS). Segregação de anexos sensíveis com URLs de uso único (STS).
* **Políticas**: retenção, descarte seguro, revisão anual de consentimentos, duplo fator opcional para staff.

---

## 10) Integrações & Notificações

* E-mail/WhatsApp (provedor a definir) para convites, lembretes de presença, prazos de plano de ação (opt-in).
* Webhooks para integrações externas (ex.: prefeitura/BI).

---

## 11) UX — Fluxos Essenciais

1. **Onboarding de beneficiária**: Botão “Nova beneficiária” → formulário de dados básicos → anexos opcionais → criar **Anamnese Social** → salvar e continuar.
2. **Inscrição em projeto**: no perfil → aba “Projetos” → escolher turma → aceitar acordos → gerar termo PDF e registrar assinatura.
3. **Registrar presença**: na turma → lista do dia → marcar presentes/ausentes → calculadora automática de assiduidade.
4. **Evolução**: timeline → “Novo registro” → texto + anexos + marcar se requer assinatura.
5. **Plano de Ação**: criar plano → adicionar ações (prazo/responsável/suporte) → lembretes automáticos.
6. **Mensagens**: abrir thread por beneficiária/projeto → @menções → anexos → marcar confidencialidade.
7. **Relatórios**: filtros por projeto/período → exportar.

---

## 12) Componentes de Software (Arquitetura)

* **Front-end**: SPA (React/Next.js) + UI acessível (i18n/PT-BR). Form renderer por JSON Schema. Assinatura (canvas + certificados de tempo).
* **Back-end**: API REST (Node/TypeScript, NestJS/Express, ou compatível com o *CEDEX* para lógica). Autorização por *policy-based access control*.
* **Banco**: PostgreSQL + Redis (cache e filas). Armazenamento de arquivos em S3 compatível.
* **Infra**: Docker; CI/CD; ambientes *staging* e *prod*. Observabilidade (logs estruturados, métricas, tracing básico).
* **Filas/Jobs**: envio de notificações, geração de PDFs, webhooks.

---

## 13) Especificação dos Schemas (JSON) — exemplos

### `form.anamnese_social.v1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Anamnese Social",
  "type": "object",
  "properties": {
    "identificacao": {
      "type": "object",
      "properties": {
        "data": {"type": "string", "format": "date"},
        "nome": {"type": "string"},
        "idade": {"type": "integer", "minimum": 0},
        "endereco": {"type": "string"},
        "bairro": {"type": "string"},
        "referencia": {"type": "string"},
        "nis": {"type": "string"},
        "contatos": {"type": "array", "items": {"type": "string"}},
        "rg": {"type": "string"},
        "orgao_emissor": {"type": "string"},
        "data_emissao": {"type": "string", "format": "date"},
        "cpf": {"type": "string"}
      },
      "required": ["nome"]
    },
    "situacao_socioeconomica": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "nome": {"type": "string"},
          "data_nasc": {"type": "string", "format": "date"},
          "idade": {"type": "integer"},
          "trabalha": {"type": "boolean"},
          "renda": {"type": "number"}
        },
        "required": ["nome"]
      }
    },
    "biopsicossocial": {
      "type": "object",
      "properties": {
        "uso_substancias": {"type": "array", "items": {"enum": ["alcool","drogas_ilicitas","cigarros","outros"]}},
        "transtorno_mental_ou_desenvolvimento": {"type": "boolean"},
        "desafios_transtorno": {"type": "string"},
        "pessoa_com_deficiencia": {"type": "boolean"},
        "desafios_deficiencia": {"type": "string"},
        "idosos_dependentes": {"type": "boolean"},
        "desafios_dependencia": {"type": "string"},
        "doenca_cronica_ou_degenerativa": {"type": "boolean"},
        "desafios_doenca": {"type": "string"}
      }
    },
    "vulnerabilidades": {
      "type": "array",
      "items": {"enum": ["nis","desemprego","instabilidade_empregaticia","dependencias","crianca_adolescente","idosos","pessoa_com_deficiencia"]}
    },
    "assinaturas": {
      "type": "object",
      "properties": {"beneficiaria": {"type": "string"}, "tecnica": {"type": "string"}}
    }
  }
}
```

### `form.ficha_evolucao.v1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Ficha de Evolução",
  "type": "object",
  "properties": {
    "cabecalho": {
      "type": "object",
      "properties": {
        "beneficiaria": {"type": "string"},
        "data_nascimento": {"type": "string", "format": "date"},
        "inicio_instituto": {"type": "string", "format": "date"},
        "programa_oficina_servico": {"type": "string"}
      }
    },
    "registros": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "data": {"type": "string", "format": "date"},
          "descricao": {"type": "string"},
          "responsavel": {"type": "string"}
        },
        "required": ["data","descricao"]
      }
    }
  }
}
```

> Esquemas similares estão definidos para: `declaracao_recibo`, `inscricao_projeto`, `consentimentos`, `visao_holistica`, `plano_acao`, `roda_da_vida` (ver diretório `artifacts/json_schemas`).

---

## 14) Relatórios Padrão

* **Assiduidade por turma/período** (com regra de 75%).
* **Mapa de vulnerabilidades** por beneficiária.
* **Evolução por período** (quantidade e categorias de registros).
* **Status de consentimentos** (válidos/pendentes/revogados).
* **Planos de ação** (itens por status, atrasos, responsáveis).

---

## 15) Estratégia de Implementação (marcos)

* **M0 — Fundamentos (1):** RBAC, Beneficiárias CRUD, Anexos, Auditoria.
* **M1 — Forms Service:** engine JSON Schema + renderização + exportação PDF + Anamnese + Consentimentos.
* **M2 — Projetos & Inscrições:** projetos/turmas, acordos, matrícula, presença.
* **M3 — Evolução & Plano de Ação:** timeline, plano/itens, lembretes.
* **M4 — Mensagens & Feed:** threads, menções, feed com segmentação.
* **M5 — Relatórios & Polimento:** dashboards, exportações, performance, segurança avançada.

---

## 16) Qualidade, Testes & Observabilidade

* **Testes**: unitários (domínio), integração (API), E2E (fluxos críticos), contrato (OpenAPI), acessibilidade (axe), performance (k6).
* **Dados de demonstração**: seeds de usuários, projetos, 10 beneficiárias, 2 turmas, 30 presenças.
* **Alertas**: falhas de jobs, picos de erro 5xx, lentidão de queries, webhooks com retry exponencial.

---

## 17) Segurança Operacional

* Política de mínimo privilégio; rotação de segredos; backups automáticos; restauração testada; verificação anti-malware em anexos; limites de taxa (rate limiting) e bloqueios temporários.

---

## 18) Entregáveis

* Repositório com **API** (docs OpenAPI) + **Front** (SPA) + **Infra** (Docker Compose + IaC mínima).
* **Schemas JSON** versionados para cada formulário.
* **Migrações SQL** e **seed** inicial.
* **Guia de Operação** (admin/rbac, backups, exportações LGPD).

---

## 19) Próximos Passos

1. Confirmar terminologia (ex.: PAEDI) e dicionário de dados.
2. Carregar templates dos termos/recibos e cabeçalhos IMM (brand) no gerador de PDF.
3. Definir provedores (e-mail/WhatsApp/armazenamento).
4. Iniciar M0 e M1 conforme marcos.

---

## 20) Artefatos Entregues (v0.1)

* **JSON Schemas**: `form.declaracao_recibo.v1.json`, `form.inscricao_projeto.v1.json`, `form.consentimentos.v1.json`, `form.visao_holistica.v1.json`, `form.plano_acao.v1.json`, `form.roda_da_vida.v1.json`.
* **SQL**: `0001_initial.sql` (migração completa do schema).
* **Pacote ZIP**: `imm_artifacts_v01.zip` (todos os arquivos acima + README).

**Observações**

* Schemas estão prontos para um renderer por JSON Schema (Draft 2020-12).
* Campos de assinatura são `string` para aceitar: assinatura desenhada (data URL), nome digitado + selo de tempo, ou caminho de arquivo de upload.
* Você pode versionar novos templates como `*.v2` mantendo retrocompatibilidade em `form_submissions.schema_version`.

---

**FIM — v0.1**
