# Plano de Implementação — Sistema de Gestão de Beneficiárias IMM

## 1. Visão geral

Este plano descreve como entregar o "mini-ERP social" do Instituto Move Marias (IMM) a partir da especificação funcional & técnica v0.1. Ele alinha escopo, fases, responsáveis, marcos, riscos e critérios de aceite, conectando os épicos e histórias do backlog CODEx às atividades de engenharia, produto e operação.

### Objetivos principais

1. Garantir conformidade legal (LGPD) e segurança desde o primeiro release.
2. Disponibilizar os módulos essenciais para o ciclo de atendimento das beneficiárias.
3. Entregar capacidades de formulários dinâmicos, comunicação interna e relatórios.
4. Estabelecer base de observabilidade, CI/CD e governança operacional.

### Princípios de execução

- **Security & privacy first**: requisitos legais são pré-condições para MVP.
- **Entrega incremental validada**: cada marco libera funcionalidades auditáveis em staging.
- **Automação**: testes, migrações, deploy e rotinas operacionais automatizadas.
- **Dados confiáveis**: trilhas de auditoria, versionamento de schemas e métricas observáveis.

## 2. Estrutura organizacional

| Pilar | Responsável | Equipe envolvida | Funções-chave |
| --- | --- | --- | --- |
| Produto & UX | Product Manager IMM | UX/UI, Pesquisa, Jurídico | Priorização, validação com stakeholders, conteúdo dos termos |
| Engenharia Backend | Tech Lead Backend | Devs Node/Nest, DBA | API, domínio, segurança, integrações |
| Engenharia Frontend | Tech Lead Frontend | Devs React/Next | SPA, forms renderer, UX |
| DevSecOps & Infra | SRE Lead | Eng. DevOps, Segurança | CI/CD, IaC, observabilidade, KMS/Vault |
| Dados & BI | Data Analyst | Eng. Dados | Relatórios, pipelines, métricas |
| Change Management | Coordenadora IMM | RH, Treinamento | Comunicação interna, capacitação |

## 3. Fases e marcos

| Fase | Duração estimada | Marcos principais | Saídas |
| --- | --- | --- | --- |
| **M0 — Fundamentos & Segurança** | Semanas 1-3 | SEC-04, SEC-01, SEC-02, SEC-03, infra básica | Ambiente provisionado, RBAC inicial, storage seguro, cryptografia | 
| **M1 — Forms Service & Consentimentos** | Semanas 3-6 | FOR-01 a FOR-04, seeds de formulários | Forms dinâmicos, geração de PDF, assinaturas digitais | 
| **M2 — Projetos, Inscrições & Frequência** | Semanas 5-8 | PRJ-01 a PRJ-04 (do backlog), integrações básicas | Gestão de projetos/turmas, matrículas, presenças, acordos | 
| **M3 — Evolução, Plano de Ação & Timeline** | Semanas 7-9 | EVO-01 a EVO-03, PLAN-01 a PLAN-03 | Timeline consolidada, plano de ação com lembretes | 
| **M4 — Comunicação & Feed** | Semanas 9-10 | MSG-01 a MSG-04, FEED-01 a FEED-03 | Threads com anexos, feed segmentado, notificações internas |
| **M5 — Relatórios, Observabilidade & Go-Live** | Semanas 10-12 | OBS-01 a OBS-04, RPT-01 a RPT-04, DOC-01 a DOC-04 | Dashboards, exportações, SLOs/alertas, runbooks, treinamento |

> As fases se sobrepõem parcialmente para otimizar recursos; dependências críticas aparecem nos riscos.

## 4. Plano detalhado por fase

### Fase M0 — Fundamentos & Segurança

**Objetivo:** preparar infraestrutura, autenticação, RBAC inicial e controles de segurança que sustentam todo o produto.

**Atividades principais**

1. **Infraestrutura & CI/CD**
   - Provisionar ambientes (dev/staging/prod) via IaC (Terraform + Docker Compose/Kubernetes).
   - Configurar pipelines CI (lint, testes, build, segurança) e CD (deploy automatizado com gates).
   - Integrar gestão de segredos (SEC-04) com KMS/Vault + rotinas de rotação.

2. **Segurança de dados**
   - Mapear PII/PHI (SEC-01) e aplicar criptografia em repouso nas tabelas críticas.
   - Implementar mascaramento/minimização nas APIs e logs (SEC-02).
   - Configurar armazenamento seguro de anexos com S3/MinIO e ClamAV (SEC-03).

3. **Autenticação & RBAC mínimo viável**
   - Implementar login com JWT + refresh, recuperação de senha.
   - Configurar RBAC inicial com perfis Admin, Coordenação, Técnica, Educadora, Recepção.
   - Criar seeds de usuários e perfis para testes.

4. **Observabilidade básica**
   - Logging estruturado, tracing mínimo (OpenTelemetry) e métricas de health-check.
   - Configurar alertas iniciais (deploy falho, 5xx, jobs).

**Entregáveis**

- Pipelines CI/CD e IaC versionados.
- Migrações com colunas cifradas e testes passando.
- Documentação de segurança (runbooks, mapa de dados).
- Ambiente staging validado com smoke tests.

**Critérios de aceite**

- Auditoria legal aprova controles mínimos LGPD.
- Deploy automatizado para staging sem intervenção manual.
- RBAC impede acesso não autorizado aos dados sensíveis.

### Fase M1 — Forms Service & Consentimentos

**Objetivo:** habilitar criação e gestão dos formulários oficiais com versionamento, assinatura e PDFs.

**Atividades principais**

1. **Registry de schemas (FOR-01)**
   - Migrar JSON schemas fornecidos (`form.*.v1`) para tabelas de registry.
   - Seed completo e API para listar versões ativas/obsoletas.

2. **Renderização dinâmica (FOR-02)**
   - Implementar renderer React baseado em schema + UI schema.
   - Backend valida payload contra schema ativo.
   - Suporte a preview/histórico.

3. **Geração de PDF oficial (FOR-03)**
   - Templates HTML/CSS com branding IMM.
   - Serviço headless (Playwright) para PDF + QR code + hash de integridade.
   - Armazenar PDFs assinados em storage seguro.

4. **Fluxo de assinatura digital (FOR-04)**
   - Captura de assinatura (canvas, upload, nome + timestamp).
   - Coleta de evidências (IP, user-agent) e consent receipt.
   - Workflows de notificação para coleta pendente.

**Entregáveis**

- SPA com formulário Anamnese Social funcional em staging.
- API `/beneficiaries/{id}/forms` com versionamento e auditoria.
- PDFs e consentimentos assinados acessíveis via RBAC.

**Critérios de aceite**

- Time técnico valida preenchimento ponta-a-ponta de Anamnese, Consentimentos e Plano de Ação.
- QA aprova testes automatizados de validação e regressão visual.
- Jurídico valida termos e evidências de consentimento.

### Fase M2 — Projetos, Inscrições & Frequência

**Objetivo:** gerir oferta de projetos/oficinas, matrículas e assiduidade.

**Atividades principais**

1. **Catálogo de projetos e turmas**
   - CRUD de projetos, cohorts, capacidade e horários (PRJ-01, PRJ-02).
   - RBAC garantindo que educadoras vejam apenas suas turmas.

2. **Inscrição & desligamento (PRJ-03)**
   - Fluxo para matricular beneficiária, gerar acordos e termos (reuso do Forms Service).
   - Motivos de desligamento com assinatura.

3. **Controle de frequência (PRJ-04)**
   - Registro diário de presenças/ausências, justificativas, anexos.
   - Cálculo automático da assiduidade (alerta <75%).
   - Exportação CSV por turma/período.

**Entregáveis**

- Tela Projetos com visão geral e turmas.
- Aba "Projetos" no perfil da beneficiária com status da matrícula.
- Relatório de frequência básico.

**Critérios de aceite**

- Coordenação consegue abrir turma, matricular beneficiária e gerar termo.
- Educadoras registram frequência em mobilidade (tablet/notebook).
- Alertas de baixa assiduidade aparecem na timeline.

### Fase M3 — Evolução, Plano de Ação & Timeline

**Objetivo:** consolidar acompanhamento da beneficiária e ações planejadas.

**Atividades principais**

1. **Timeline unificada (EVO-01)**
   - Exibir eventos: formulários, atendimentos, presenças, planos, mensagens.
   - Filtros por tipo, responsável e período.

2. **Ficha de evolução (EVO-02)**
   - CRUD de registros, anexos, assinatura opcional.
   - Integração com timeline e auditoria.

3. **Plano de ação personalizado (PLAN-01 a PLAN-03)**
   - CRUD de planos e itens com responsável, prazo, status e suporte.
   - Lembretes automáticos (jobs + notificações).
   - Dashboard resumido por status.

**Entregáveis**

- Timeline interativa no perfil da beneficiária.
- Plano de ação com lembretes e indicadores.
- Relatório de evolução por período.

**Critérios de aceite**

- Técnicas conseguem criar plano, atribuir tarefas e monitorar atrasos.
- Alertas de atraso aparecem na timeline e via notificação.
- Auditoria registra modificações em itens críticos.

### Fase M4 — Comunicação & Feed

**Objetivo:** habilitar comunicação interna contextualizada por beneficiária/projeto e feed institucional.

**Atividades principais**

1. **Mensageria interna (MSG-01 a MSG-04)**
   - Threads por beneficiária e por projeto com RBAC.
   - Suporte a anexos, menções e marcação de confidencialidade.
   - Indicadores de leitura, digitação e busca por histórico.

2. **Feed institucional (FEED-01 a FEED-03)**
   - Postagens segmentadas por projeto ou gerais.
   - Comentários, reações e moderação (Admin/Coordenação).
   - Integração com notificações internas.

3. **Notificações (cross-épico)**
   - Orquestrar envio por e-mail/WhatsApp (EPIC 5) para mensagens, lembretes de planos, novos posts.

**Entregáveis**

- Inbox com threads e filtros.
- Feed com posts publicados em staging.
- Notificações entregues via provider selecionado.

**Critérios de aceite**

- Usuários conseguem iniciar thread, anexar documento e definir visibilidade.
- Feed suporta publicação com anexos, comentários e segmentação.
- Logs/observabilidade mostram métricas de mensagens/notificações.

### Fase M5 — Relatórios, Observabilidade & Go-Live

**Objetivo:** fechar lacunas de governança, monitoramento, treinamento e liberar produção.

**Atividades principais**

1. **Relatórios & dashboards (RPT-01 a RPT-04)**
   - Indicadores: beneficiárias ativas, inscrições, assiduidade, vulnerabilidades, consentimentos.
   - Exportações CSV/XLSX, geração de PDFs para relatórios-chave.
   - Integração básica com BI (dump em S3/BigQuery se aplicável).

2. **Observabilidade avançada (OBS-01 a OBS-04)**
   - Dashboard Grafana/Datadog com métricas chave.
   - Tracing distribuído completo e logs correlacionados.
   - SLOs e alertas com runbooks, teste de caos básico.

3. **Operação & governança (DOC-01 a DOC-04)**
   - Guia operacional (backups, incident response, LGPD, DSRs).
   - Treinamentos presenciais/online, materiais de apoio.
   - Plano de rollout e suporte pós-go-live.

4. **Go-live controlado**
   - Migração de dados (se houver legados).
   - Feature flags e toggle para liberar acesso gradual.
   - War room 2 semanas pós-go-live com indicadores e suporte dedicado.

**Entregáveis**

- Painéis operacionais e relatórios prontos.
- Documentação completa no repositório + Confluence.
- Usuários treinados, listas de presença registradas.

**Critérios de aceite**

- Stakeholders aprovam relatórios e dashboards.
- SRE valida SLOs e alertas.
- Go-live executado com plano de rollback definido.

## 5. Cronograma macro (Gantt simplificado)

```
Semanas 1-3: [M0] ██████████
Semanas 3-6:     [M1]     ██████████
Semanas 5-8:         [M2]     ███████
Semanas 7-9:             [M3]   █████
Semanas 9-10:               [M4]  ███
Semanas 10-12:                 [M5] █████
```

## 6. Dependências críticas

1. **SEC-04 (KMS/Vault)** antes de SEC-01/SEC-03/FOR-04.
2. **FOR-01** finalizado antes de FOR-02/FOR-03/FOR-04.
3. **M1** concluída antes da matrícula (M2), já que acordos reutilizam Forms Service.
4. **Observabilidade básica** (M0) habilita QA e validações em fases posteriores.
5. **Notificações (EPIC 5)** dependem de infraestrutura de filas configurada em M0.

## 7. Gestão de riscos

| Risco | Probabilidade | Impacto | Mitigação | Plano de contingência |
| --- | --- | --- | --- | --- |
| Atraso na implantação de KMS/Vault | Média | Alta | Antecipar provisioning e envolver segurança cedo | Utilizar solução temporária (AWS KMS nativa) com migração planejada |
| Complexidade na criptografia de dados legados | Alta | Alta | PoC em staging com subset de dados, ferramentas de migração | Ativar modo híbrido com colunas antigas somente leitura até migração completa |
| Geração de PDFs com inconsistência visual | Média | Média | Testes visuais automatizados e homologação com coordenação | Disponibilizar fallback para download do formulário em HTML |
| Falha nos provedores de WhatsApp/e-mail | Média | Média | Contratos com dois provedores, abstr layer | Switch automático para canal alternativo, fallback manual |
| Resistência de usuários na adoção | Média | Média | Plano de comunicação e treinamento antecipado | Suporte presencial estendido e ajustes rápidos pós-go-live |

## 8. Qualidade e testes

- **Automação:** vitest/jest (unit), supertest (API), Playwright (E2E), axe (acessibilidade), k6 (performance), OWASP ZAP (segurança).
- **Cobertura mínima:** 80% backend, 70% frontend; relatórios semanais.
- **Ambientes:** dev (feature branches), staging (integração e UAT), prod (com feature flags).
- **Gate de release:** suite automatizada verde + checklist de segurança + aprovação produto/jurídico.
- **Dados de teste:** seeds com 10 beneficiárias, 2 turmas, 30 presenças (já previsto na especificação).

## 9. Comunicação e governança

- **Ritos semanais:** planejamento, daily assíncrona, review com stakeholders e retro quinzenal.
- **Relatórios:** burn-up por épico, mapa de riscos, status de conformidade LGPD.
- **Documentação viva:** README, docs/ (arquitetura, observabilidade, notificações), Confluence (procedimentos).
- **Change management:** newsletters internas, sessões de dúvidas, suporte via canal dedicado.

## 10. Critérios para Go-Live e pós-implantação

1. **Checklist pré-go-live**
   - Todos os épicos críticos concluídos (1 a 6).
   - Testes de regressão e performance executados.
   - Pen-test concluído e findings críticos resolvidos.
   - Aprovação formal da diretoria IMM.

2. **Pós-go-live (30 dias)**
   - Monitoramento intensivo (war room) com SLOs/SLA.
   - Roadmap de melhorias rápidas baseado no feedback inicial.
   - Revisão de segurança (logs, acessos, incidentes).
   - Planejamento de releases subsequentes (v0.2+).

## 11. Apêndice — Mapeamento épicos ↔ fases

| Épico | Fases principais | Observações |
| --- | --- | --- |
| EPIC 1 — LGPD & Segurança | M0, M5 | Controles adicionais (retention, auditoria reforçada) finalizados em M5 |
| EPIC 2 — Forms Service | M1 | Dependência forte com M0 (storage seguro) |
| EPIC 3 — Portal Beneficiárias | M2, M3 | Requer forms e segurança prontos |
| EPIC 4 — Mensagens & Feed | M4 | Usa notificações e storage de anexos |
| EPIC 5 — Notificações | M0, M4, M5 | Configuração inicial em M0, uso em M4, hardening em M5 |
| EPIC 6 — Observabilidade | M0, M5 | Básico em M0, avançado em M5 |
| EPIC 7 — Documentação & Governança | Transversal (M0-M5) | Releases de docs a cada marco |
| EPIC 8 — Conformidade adicional | M0, M5 | MFA e DSRs habilitados até o go-live |

---

Este plano deve ser revisado quinzenalmente para atualizar estimativas, riscos e dependências com base no progresso real e no feedback dos stakeholders.
