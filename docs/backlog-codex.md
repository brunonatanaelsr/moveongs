# Backlog CODEx — Cobertura da Especificação IMM

Este backlog converte as necessidades legais e operacionais em stories acionáveis. Cada item já segue o template sugerido (descrição, critérios de aceite, DoD, estimativa T-shirt, dependências e subtarefas) para facilitar a criação de issues no board do time.

## Convenções

- **Estimativas:** S (Small), M (Medium), L (Large).
- **Dependências:** utilize os IDs (ex.: `SEC-04`) para vincular stories relacionadas.
- **DoD padrão:** testes automatizados, observabilidade, revisão de segurança, documentação atualizada, migrações versionadas/rollback, demo validada.


---

## EPIC 1 — LGPD & Segurança de Dados (Prioridade legal)

### SEC-01 — Criptografia de campos sensíveis em repouso
**Descrição:** aplicar pgcrypto/KMS para PII/PHI (beneficiárias, evoluções, consentimentos, mensagens), garantindo consultas determinísticas ou por hash quando necessário.
**Critérios de aceite:**
- [ ] Mapa completo de PII/PHI versionado no repositório de arquitetura.
- [ ] Migrações criadas e aplicadas em staging com colunas `_enc`, backfill seguro e validação de integridade.
- [ ] Índices ou estratégias de consulta documentadas para campos cifrados.
- [ ] Rotina de rotação de chaves descrita e testada em homologação.
**DoD:** testes de integração cobrindo CRUD cifrado; playbook de recuperação/rotação; performance budget validado.
**Estimativa:** L
**Dependências:** SEC-04
**Subtarefas:**
- [ ] Levantar PII/PHI por tabela
- [ ] Definir algoritmo e fluxo KMS/pgcrypto
- [ ] Escrever migrações/backfill
- [ ] Ajustar ORM/repos
- [ ] Validar desempenho/índices
- [ ] Atualizar testes e documentação

### SEC-02 — Mascaramento e minimização no retorno da API
**Descrição:** adequar respostas por papel e garantir ausência de PII em logs/eventos.
**Critérios de aceite:**
- [ ] OpenAPI com schemas específicos (admin/técnico/beneficiária) e exemplos mascarados.
- [ ] Middleware de logging removendo/anonimizando PII.
- [ ] Auditoria de endpoints confirmando ausência de dados sensíveis fora de contexto.
**DoD:** testes unitários/snapshot; documentação de RBAC; revisão de segurança.
**Estimativa:** M
**Dependências:** SEC-01
**Subtarefas:**
- [ ] Atualizar serializers/resolvers
- [ ] Revisar logging/observabilidade
- [ ] Atualizar contratos OpenAPI
- [ ] Validar com time jurídico

### SEC-03 — Storage seguro de anexos (S3 compatível)
**Descrição:** migrar anexos para S3/MinIO com encriptação server-side, URLs assinadas e antivírus assíncrono.
**Critérios de aceite:**
- [ ] Upload via pre-signed URL (validação MIME, tamanho, extensão).
- [ ] Downloads com autorização RBAC e expiração ≤ 15 min.
- [ ] Integração com ClamAV (scan assíncrono + quarentena opcional).
**DoD:** benchmark de latência; bucket policy/IAM revisados; runbook de incidentes.
**Estimativa:** M
**Dependências:** SEC-04
**Subtarefas:**
- [ ] Provisionar bucket/policies
- [ ] Implementar adapters/assinaturas
- [ ] Integrar antivírus e fila
- [ ] Atualizar UI/API
- [ ] Documentar uso e incidentes

### SEC-04 — Gestão de chaves e segredos (KMS + Vault)
**Descrição:** centralizar chaves/segredos em KMS/Vault, habilitando envelope encryption e rotação automática.
**Critérios de aceite:**
- [ ] Segredos migrados; nenhum valor sensível em `.env` ou código.
- [ ] Processo de rotação sem downtime validado.
- [ ] Auditoria habilitada com alertas de acesso.
**DoD:** automação em CI/CD; runbook de rotação; testes de integração.
**Estimativa:** M
**Dependências:** —
**Subtarefas:**
- [ ] Provisionar KMS/Vault
- [ ] Criar scripts de bootstrap/rotina
- [ ] Atualizar serviços para consumir segredos
- [ ] Configurar auditoria/alertas

### SEC-05 — Retenção e anonimização
**Descrição:** definir políticas de retenção por documento e implementar jobs de expurgo/anonimização com legal hold.
**Critérios de aceite:**
- [ ] Tabela de prazos aprovada e versionada.
- [ ] Job em staging executando dry run com relatório.
- [ ] Legal hold impede expurgo e gera trilha de auditoria.
**DoD:** testes e2e; documentação LGPD; monitoramento de execuções.
**Estimativa:** M
**Dependências:** SEC-01, SEC-04
**Subtarefas:**
- [ ] Modelar políticas
- [ ] Implementar scheduler/workers
- [ ] Criar API/UI de legal hold
- [ ] Relatórios e alertas

### SEC-06 — Auditoria reforçada e tamper-evident
**Descrição:** criar trilha de auditoria imutável (append-only com hashes encadeados) para ações sensíveis e assinaturas.
**Critérios de aceite:**
- [ ] Estrutura append-only com hash do registro anterior em produção.
- [ ] Job de verificação periódica com alerta em caso de inconsistência.
- [ ] Cobertura de eventos críticos validada (acessos PII, alterações, assinaturas).
**DoD:** testes de consistência; dashboard de auditoria; documentação de consulta.
**Estimativa:** M
**Dependências:** SEC-04, SEC-01
**Subtarefas:**
- [ ] Definir modelo de trilha
- [ ] Instrumentar serviços
- [ ] Criar verificação/alertas
- [ ] Treinar time de operações

---

## EPIC 2 — Form Service Completo (Schemas + PDFs + Assinatura)

### FOR-01 — Importar e versionar todos os JSON Schemas
**Descrição:** criar registry versionado para formulários obrigatórios (inscrição, consentimentos, plano de ação, roda da vida etc.).
**Critérios de aceite:**
- [ ] Tabela com `schema_id`, `version`, `status`, `checksum`.
- [ ] Seed inicial cobre 100% dos formulários obrigatórios.
- [ ] API permite consultar versões atuais e históricas.
**DoD:** testes de migração/seed; documentação de contribuição; validação com time clínico.
**Estimativa:** M
**Dependências:** DOC-03 (opcional)
**Subtarefas:**
- [ ] Inventariar schemas
- [ ] Normalizar JSON/UI schema
- [ ] Criar migração e seed
- [ ] Testar validação

### FOR-02 — Renderização dinâmica (front/back)
**Descrição:** implementar renderer dinâmico com validação automática e fallback para schemas obsoletos.
**Critérios de aceite:**
- [ ] Frontend renderiza com base em schema/UI schema e permite preview por versão.
- [ ] Backend valida submissões contra schema ativo.
- [ ] Usuário informado quando versão estiver depreciada.
**DoD:** testes unitários/integração; documentação de extensões; feature flag para rollout.
**Estimativa:** M
**Dependências:** FOR-01
**Subtarefas:**
- [ ] Selecionar/implementar renderer
- [ ] Criar serviço de validação backend
- [ ] Integrar UI
- [ ] Escrever testes e docs

### FOR-03 — Geração de PDF oficial IMM
**Descrição:** gerar PDFs padronizados (HTML→PDF) com cabeçalho/rodapé IMM, QR de verificação e hash.
**Critérios de aceite:**
- [ ] PDFs idempotentes com metadados de versão.
- [ ] QR code aponta para endpoint de verificação com hash.
- [ ] Templates versionados com rollback possível.
**DoD:** testes visuais/regression; pipeline de geração validada; armazenamento seguro.
**Estimativa:** M
**Dependências:** FOR-01, SEC-03
**Subtarefas:**
- [ ] Definir engine (Puppeteer/Playwright)
- [ ] Criar templates e estilo
- [ ] Implementar serviço de hash/QR
- [ ] Automatizar testes

### FOR-04 — Assinatura digital e captura de evidências
**Descrição:** fluxo completo de assinatura (beneficiária/profissional) com consent receipts, captura de IP/UA/timestamp e suporte a OTP/email e WebAuthn.
**Critérios de aceite:**
- [ ] Assinaturas versionadas com trilha de auditoria e hash do PDF.
- [ ] Evidências armazenadas de forma cifrada e consultáveis.
- [ ] Fluxo OTP/WebAuthn com fallback e registro de tentativas.
**DoD:** testes e2e; avaliação jurídica; documentação de suporte.
**Estimativa:** L
**Dependências:** FOR-03, SEC-06, COM-01 (para MFA opcional)
**Subtarefas:**
- [ ] Desenhar jornada
- [ ] Integrar provedores OTP/WebAuthn
- [ ] Persistir evidências cifradas
- [ ] Atualizar UI/notifications
- [ ] Testes e documentação

### FOR-05 — Seed completo
**Descrição:** adicionar seeds com formulários preenchidos realistas para staging/demo.
**Critérios de aceite:**
- [ ] Seeds cobrem ao menos um cenário por formulário obrigatório.
- [ ] Dados fictícios respeitam LGPD (sem PII real).
- [ ] Scripts idempotentes e versionados.
**DoD:** execução validada em CI; documentação de uso; screenshots para demo.
**Estimativa:** S
**Dependências:** FOR-01, FOR-02, DOC-03
**Subtarefas:**
- [ ] Gerar dados fictícios
- [ ] Criar scripts de seed
- [ ] Validar no ambiente
- [ ] Atualizar documentação

---

## EPIC 3 — Portal & Experiência das Beneficiárias (RBAC + Telas)

### FE-01 — RBAC por perfis (admin, técnico, beneficiária)
**Descrição:** implementar guards por rota/endpoint e feature flags por papel.
**Critérios de aceite:**
- [ ] Perfis carregados do backend com claims verificáveis.
- [ ] Rotas protegidas e menus dinâmicos.
- [ ] Auditoria de tentativas de acesso negadas.
**DoD:** testes automatizados; documentação de papéis; revisão de segurança.
**Estimativa:** M
**Dependências:** SEC-02
**Subtarefas:**
- [ ] Definir matriz RBAC
- [ ] Implementar guards front/back
- [ ] Atualizar menus/feature flags
- [ ] Criar testes

### FE-02 — Autenticação Beneficiária + recuperação segura
**Descrição:** fluxo dedicado com política de senha, rate limit, CAPTCHA e MFA opcional.
**Critérios de aceite:**
- [ ] Cadastro/recuperação com validação forte e rate limiting.
- [ ] CAPTCHA em fluxos sensíveis.
- [ ] Integração com MFA (COM-01) quando habilitado.
**DoD:** testes e2e; runbook de suporte; revisão de UX acessível.
**Estimativa:** M
**Dependências:** FE-01, COM-01
**Subtarefas:**
- [ ] Implementar backend de autenticação
- [ ] Integrar CAPTCHA
- [ ] Atualizar UI
- [ ] Monitorar logs
- [ ] Testes

### FE-03 — Documentos & Assinaturas
**Descrição:** telas para listagem, visualização, download (URL assinada) e status de assinatura.
**Critérios de aceite:**
- [ ] Lista com filtros por status/versão.
- [ ] Visualização com preview seguro e download via URL expirada.
- [ ] Indicação de assinaturas pendentes com CTA.
**DoD:** testes de interface; tracking de eventos; documentação de uso.
**Estimativa:** M
**Dependências:** SEC-03, FOR-03, FOR-04
**Subtarefas:**
- [ ] Desenhar UI
- [ ] Consumir endpoints
- [ ] Integrar fluxo de assinatura
- [ ] Adicionar métricas

### FE-04 — Agenda e recibos
**Descrição:** apresentar agenda de atendimentos e recibos para beneficiárias.
**Critérios de aceite:**
- [ ] Calendário com eventos sincronizados à API.
- [ ] Recibos downloadáveis com URL assinada e status.
- [ ] Notificações de alteração/cancelamento.
**DoD:** testes UX; documentação; telemetria de uso.
**Estimativa:** M
**Dependências:** NOT-01, SEC-03
**Subtarefas:**
- [ ] Integrar API de agenda
- [ ] Criar componentes de calendário
- [ ] Implementar recibos
- [ ] Instrumentar analytics

### FE-05 — Timeline de atendimentos
**Descrição:** feed cronológico consolidando eventos (formulários, mensagens, presenças, anexos).
**Critérios de aceite:**
- [ ] Eventos ordenados por timestamp com filtros.
- [ ] Links para documentos/mensagens correspondentes.
- [ ] Auditoria para alterações relevantes.
**DoD:** testes de integração; monitoramento; documentação.
**Estimativa:** M
**Dependências:** UX-01, UX-03, SEC-06
**Subtarefas:**
- [ ] Definir agregador de eventos
- [ ] Implementar API/queries
- [ ] Criar UI/UX
- [ ] Instrumentar logs

---

## EPIC 4 — Mensageria, Feed e Plano de Ação (Front)

### UX-01 — Threads de mensagens
**Descrição:** interface para threads com anexos, indicadores de digitação e recibos de leitura.
**Critérios de aceite:**
- [ ] Criar/ler/responder com upload seguro (SEC-03).
- [ ] Typing indicator em tempo real e read receipts confiáveis.
- [ ] Tratamento offline/erro com retry.
**DoD:** testes e2e; telemetria; documentação de UX.
**Estimativa:** M
**Dependências:** NOT-01 (opcional)
**Subtarefas:**
- [ ] Integrar WebSocket/long polling
- [ ] Implementar UI de thread
- [ ] Validar anexos
- [ ] Criar testes/telemetria

### UX-02 — Feed institucional
**Descrição:** feed de comunicados com filtros e leitura confirmada.
**Critérios de aceite:**
- [ ] Posts com categorias e segmentação por perfil.
- [ ] Confirmação de leitura registrada e auditável.
- [ ] Scheduling de publicações.
**DoD:** testes; métricas de engajamento; documentação.
**Estimativa:** M
**Dependências:** FE-01
**Subtarefas:**
- [ ] Definir modelo de feed
- [ ] Criar endpoints
- [ ] Desenvolver UI/UX
- [ ] Instrumentar analytics

### UX-03 — Plano de ação (tarefas, progresso, lembretes)
**Descrição:** UI para CRUD de tarefas, progresso, responsáveis e integração com notificações.
**Critérios de aceite:**
- [ ] CRUD completo com checagem de permissões.
- [ ] Indicadores de progresso e histórico.
- [ ] Lembretes integrados a NOT-02/NOT-01.
**DoD:** testes e2e; observabilidade; documentação.
**Estimativa:** M
**Dependências:** NOT-01, NOT-02
**Subtarefas:**
- [ ] Definir UI/fluxo
- [ ] Integrar APIs
- [ ] Configurar notificações
- [ ] Criar testes/telemetria

---

## EPIC 5 — Notificações Externas (E-mail/WhatsApp + Webhooks)

### NOT-01 — Provedores
**Descrição:** implementar adapters para e-mail (SES/SendGrid) e WhatsApp (Twilio/Zenvia) com sandbox/prod.
**Critérios de aceite:**
- [ ] Adapters com interface comum e métricas de entrega/abertura.
- [ ] Configuração separada por ambiente.
- [ ] Observabilidade integrada (logs/métricas).
**DoD:** testes unitários/integrados; documentação de setup; security review.
**Estimativa:** M
**Dependências:** SEC-04
**Subtarefas:**
- [ ] Selecionar provedores
- [ ] Implementar adapters
- [ ] Configurar métricas
- [ ] Criar testes/runbook

### NOT-02 — Orquestração e DLQ
**Descrição:** fila com retry exponencial, DLQ e idempotência para notificações.
**Critérios de aceite:**
- [ ] Pipeline com garantias de entrega e deduplicação.
- [ ] Monitoramento de fila e DLQ com alertas.
- [ ] Ferramentas para reprocessar DLQ.
**DoD:** testes de carga; documentação operacional; dashboards.
**Estimativa:** M
**Dependências:** NOT-01
**Subtarefas:**
- [ ] Definir infraestrutura (SQS/Rabbit/etc.)
- [ ] Implementar produtores/consumidores
- [ ] Configurar DLQ e monitoramento
- [ ] Criar painel/alertas

### NOT-03 — Webhooks com HMAC e replay protection
**Descrição:** expor webhooks assinados com HMAC e proteção contra replay.
**Critérios de aceite:**
- [ ] Assinatura HMAC com timestamp e nonce.
- [ ] Validação de replay e rate limit.
- [ ] Documentação para parceiros.
**DoD:** testes de segurança; exemplos de integração; monitoramento.
**Estimativa:** S
**Dependências:** NOT-02
**Subtarefas:**
- [ ] Implementar endpoint
- [ ] Armazenar nonces
- [ ] Atualizar documentação
- [ ] Criar testes

---

## EPIC 6 — Observabilidade & Operação (Logs, Métricas, CI/CD, IaC)

### OBS-01 — Logs estruturados + correlação
**Descrição:** padronizar logs com `trace_id` e sampling configurável.
**Critérios de aceite:**
- [ ] Serviços emitem logs JSON com trace/span.
- [ ] Sampling configurável por ambiente.
- [ ] Dashboards de consulta prontos.
**DoD:** testes; documentação de busca; integração com stack observabilidade.
**Estimativa:** S
**Dependências:** SEC-02
**Subtarefas:**
- [ ] Atualizar middlewares
- [ ] Configurar exportação
- [ ] Criar dashboards

### OBS-02 — Métricas e tracing (OpenTelemetry)
**Descrição:** instrumentar métricas chave (latência, erros, filas) e tracing distribuído.
**Critérios de aceite:**
- [ ] Exportação OTEL para agregador definido.
- [ ] Exemplars conectando trace↔métrica.
- [ ] Dashboards p95/p99 e taxa de erro.
**DoD:** testes de carga; documentação; alertas básicos.
**Estimativa:** M
**Dependências:** OBS-01
**Subtarefas:**
- [ ] Configurar SDK OTEL
- [ ] Instrumentar endpoints críticos
- [ ] Criar dashboards
- [ ] Validar com carga

### OBS-03 — Alertas & SLOs
**Descrição:** definir SLOs (latência p95, taxa de erro) e alertas com runbooks.
**Critérios de aceite:**
- [ ] SLOs publicados e monitorados.
- [ ] Alertas com níveis e escalonamento.
- [ ] Runbooks validados em tabletop exercise.
**DoD:** testes de disparo; documentação; revisão com operações.
**Estimativa:** S
**Dependências:** OBS-02
**Subtarefas:**
- [ ] Definir métricas
- [ ] Configurar alertas
- [ ] Escrever runbooks
- [ ] Realizar simulações

### OBS-04 — CI/CD completo
**Descrição:** pipelines cobrindo lint, testes, migrações, build Docker, SCA/SAST e deploy com preview envs.
**Critérios de aceite:**
- [ ] Pipeline automatizado para PR e main.
- [ ] Escaneamentos SCA/SAST com gates configurados.
- [ ] Preview environments provisionados por PR.
**DoD:** documentação da pipeline; monitoramento; revisão de segurança.
**Estimativa:** M
**Dependências:** OBS-01, OBS-02
**Subtarefas:**
- [ ] Definir stages
- [ ] Integrar scanners
- [ ] Automatizar migrações
- [ ] Configurar preview
- [ ] Testar pipeline

### OBS-05 — Docker Compose + IaC (staging/prod)
**Descrição:** padronizar infraestrutura com IaC e Compose para dev/staging.
**Critérios de aceite:**
- [ ] Repositório IaC versionado (Terraform/Pulumi).
- [ ] Compose para desenvolvimento com serviços dependentes.
- [ ] Provisionamento automatizado para staging/prod.
**DoD:** testes de provisioning; documentação; revisão de segurança.
**Estimativa:** M
**Dependências:** OBS-04, SEC-04
**Subtarefas:**
- [ ] Modelar infraestrutura
- [ ] Escrever scripts IaC
- [ ] Configurar pipelines
- [ ] Validar ambientes

---

## EPIC 7 — Documentação & Governança

### DOC-01 — Publicar OpenAPI
**Descrição:** disponibilizar `openapi.json` atualizado e Swagger UI versionado com checagem em CI.
**Critérios de aceite:**
- [ ] Build gera `openapi.json` como artefato.
- [ ] Swagger UI acessível com controle de acesso.
- [ ] Validação em CI impede inconsistências.
**DoD:** testes; instruções de uso; link no portal.
**Estimativa:** S
**Dependências:** SEC-02
**Subtarefas:**
- [ ] Gerar documentação
- [ ] Integrar na pipeline
- [ ] Hospedar UI

### DOC-02 — Guia Operacional
**Descrição:** compilar runbook com backups/restores, rotação de chaves, incident response e exportações LGPD.
**Critérios de aceite:**
- [ ] Guia publicado (MD/Confluence) revisado por operações.
- [ ] Procedimentos testados e assinados.
- [ ] Plano de comunicação de incidentes definido.
**DoD:** revisão cross-team; link no repositório; checklist atualizado.
**Estimativa:** S
**Dependências:** SEC-04, OBS-05
**Subtarefas:**
- [ ] Coletar inputs
- [ ] Escrever guia
- [ ] Validar com tabletop
- [ ] Publicar

### DOC-03 — Seeds/Dados demo abrangentes
**Descrição:** preparar conjunto de dados demo consistente com LGPD para demonstrações e QA.
**Critérios de aceite:**
- [ ] Seeds cobrem jornadas principais (triagem→execução→relatórios).
- [ ] Script idempotente integrado ao onboarding dev.
- [ ] Documentação orientando uso e limpeza.
**DoD:** testes automáticos; validação com PO; armazenar artefatos.
**Estimativa:** S
**Dependências:** FOR-05, SEC-01
**Subtarefas:**
- [ ] Gerar dados sintéticos
- [ ] Criar scripts de carga
- [ ] Validar flows
- [ ] Documentar

---

## EPIC 8 — Conformidade Adicional (MFA, Consentimentos anuais, DSR)

### COM-01 — MFA (TOTP/WebAuthn)
**Descrição:** implementar MFA com opção TOTP/WebAuthn, backup codes e remember device seguro.
**Critérios de aceite:**
- [ ] Política opt-in configurável por papel/projeto.
- [ ] Backup codes e revogação de dispositivos.
- [ ] Remember device com binding criptográfico e expiração.
**DoD:** testes; documentação para suporte; auditoria de eventos.
**Estimativa:** M
**Dependências:** SEC-04
**Subtarefas:**
- [ ] Escolher provedores
- [ ] Implementar fluxo
- [ ] Criar UI de gestão
- [ ] Instrumentar monitoramento

### COM-02 — Revisão anual de consentimentos
**Descrição:** job para disparar renovações anuais, expirar acessos e registrar respostas.
**Critérios de aceite:**
- [ ] Job agenda renovações e envia notificações.
- [ ] Acessos expiram automaticamente se não renovados.
- [ ] Relatórios de status para jurídico.
**DoD:** testes; documentação; auditoria.
**Estimativa:** S
**Dependências:** FOR-04, NOT-01
**Subtarefas:**
- [ ] Definir calendário
- [ ] Implementar job/notificações
- [ ] Atualizar UI
- [ ] Relatórios

### COM-03 — Exportação/atendimento a titulares (DSR)
**Descrição:** fornecer export JSON/PDF dos dados do titular com SLA e trilha de auditoria.
**Critérios de aceite:**
- [ ] Endpoint seguro para solicitar export.
- [ ] Arquivo contendo dados + log de tratamento.
- [ ] SLA monitorado e reportado.
**DoD:** testes de segurança; documentação pública; auditoria.
**Estimativa:** M
**Dependências:** SEC-01, FOR-03, DOC-02
**Subtarefas:**
- [ ] Mapear dados
- [ ] Implementar export
- [ ] Proteger com URLs assinadas
- [ ] Monitorar SLA

---

## Itens técnicos (quick wins) — SEC-QW

### SEC-QW — Hardening imediato
**Descrição:** aplicar bloqueio de upload inseguro, rate limiting, cabeçalhos de segurança, revisão de scopes e sanitização.
**Critérios de aceite:**
- [ ] Upload valida MIME/tamanho/assinatura.
- [ ] Rate limit/account lockout configurados.
- [ ] Cabeçalhos CSP/HSTS/SameSite/CSRF aplicados.
- [ ] Tokens com scopes atualizados e refresh rotation.
- [ ] Sanitização de HTML/RTF implementada.
**DoD:** testes automatizados; documentação; security review.
**Estimativa:** M
**Dependências:** SEC-04
**Subtarefas:**
- [ ] Validar uploads
- [ ] Configurar rate limiting/lockout
- [ ] Aplicar headers de segurança
- [ ] Revisar tokens e refresh rotation
- [ ] Sanitizar inputs
- [ ] Atualizar testes/docs

---

## Roadmap sugerido (8–10 semanas, 2 squads)

1. **Semanas 1–2:** SEC-04, SEC-03, SEC-01 (início), DOC-01, DOC-03, SEC-QW
2. **Semanas 3–4:** SEC-01 (concluir), SEC-02, FOR-01, FOR-03 (início), FE-01, OBS-01, OBS-02
3. **Semanas 5–6:** FOR-03 (finalizar), FOR-04 (start), FOR-05, FE-02, FE-03, NOT-01 (e-mail), OBS-04 groundwork
4. **Semanas 7–8:** UX-01, UX-03, NOT-02, NOT-03, OBS-04 (finalizar), OBS-05, COM-01 (início)
5. **Semanas 9–10:** FE-04, FE-05, SEC-05, SEC-06, COM-01 (finalizar), COM-02, COM-03, OBS-03, DOC-02

---

## Labels sugeridos

`legal/lgpd`, `security`, `infra`, `frontend`, `backend`, `forms`, `notifications`, `observability`, `docs`, `compliance`, `seed`, `openapi`, `ops`, `ci-cd`

