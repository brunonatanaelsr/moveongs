# Guia Operacional de Governança

Este guia consolida os procedimentos mínimos para manter o MoveONgs em conformidade operacional, facilitar auditorias e acelerar o onboarding de novas pessoas no time de operações.

## 1. Inventário de serviços críticos

| Área | Recurso | Responsável primário | Backup |
| --- | --- | --- | --- |
| Aplicação | API Fastify (`apps/api`) executando em ECS Fargate | Squad Backend | Squad Infra |
| Banco de dados | PostgreSQL gerenciado em RDS (Multi-AZ opcional) | Squad Dados | Squad Infra |
| Armazenamento de anexos | Diretório `UPLOADS_DIR` em volume persistente/S3 | Squad Infra | Squad Backend |
| Observabilidade | Grafana/Prometheus + CloudWatch | Squad Observability | Squad Infra |
| Secrets | AWS Secrets Manager (`/moveongs/{env}/...`) | Squad Infra | Squad Security |

Os ambientes (dev/staging/prod) são provisionados via Terraform (`infra/terraform`). Sempre versionar alterações de infraestrutura no repositório para manter rastreabilidade.

## 2. Backups e restauração

### 2.1 Banco de dados (PostgreSQL RDS)

1. **Snapshots automáticos**: habilitar `backup_window` diário com retenção mínima de 7 dias para dev/staging e 30 dias em produção. Confirmar em AWS RDS que `Backup retention period` está configurado.
2. **Snapshots manuais**: antes de deployments disruptivos (migrations extensas), criar snapshot manual nomeado `moveongs-{env}-{AAAAMMDD}`.
3. **Testes de restauração**: trimestralmente executar `terraform apply` em ambiente temporário restaurando um snapshot para validar integridade (checar tabelas críticas `beneficiaries`, `enrollments`, `audit_logs`). Documentar evidências.
4. **Restauração emergencial**:
   - Abrir incidente (`#incidentes-moveongs` no Slack).
   - Identificar snapshot mais recente.
   - Restaurar para nova instância RDS.
   - Atualizar `DATABASE_URL` no Secrets Manager e rodar `npm run migrate` se necessário.
   - Validar aplicativo (Smoke tests: `/health`, login, listagem de beneficiárias).

### 2.2 Arquivos de anexos

* Para ambientes que usam S3: habilitar versionamento e lifecycle com retenção de 30 dias.
* Para instalações on-prem (`UPLOADS_DIR`): agendar job diário (ex.: `aws s3 sync` ou `rsync`) enviando arquivos para bucket seguro `s3://moveongs-{env}-uploads/`.
* Testar restore mensal: baixar amostra e verificar leitura via endpoint `/attachments/{id}`.

### 2.3 Configurações e infraestrutura

* Backups do estado do Terraform: usar backend remoto (S3 + DynamoDB) conforme `infra/terraform/README.md`.
* Exportar dashboards e alertas do Grafana a cada release (salvar JSON no diretório `docs/observability/`).

## 3. Rotação de chaves e segredos

### 3.1 Segredos principais

| Segredo | Local | Frequência recomendada |
| --- | --- | --- |
| `JWT_SECRET` | AWS Secrets Manager (`/moveongs/{env}/jwt`) | 90 dias |
| `DATABASE_URL` | AWS Secrets Manager (`/moveongs/{env}/db`) | Após rotação de credenciais RDS |
| `NOTIFICATIONS_*` | AWS Secrets Manager | 180 dias |
| `SEED_ADMIN_PASSWORD` | Variável de CI/CD | 180 dias |

### 3.2 Processo de rotação

1. **Planejamento**: abrir tarefa no board com janela de execução e responsáveis.
2. **Geração**: utilizar gerador seguro (`openssl rand -base64 48` para JWT, `aws rds generate-db-auth-token` para credenciais temporárias se aplicável).
3. **Atualização**:
   - Atualizar segredo no Secrets Manager com `VersionStages=["AWSCURRENT"]`.
   - Invalidar caches relevantes (redeploy de tasks ECS).
4. **Validação**: executar smoke tests e garantir que tokens antigos sejam rejeitados quando apropriado.
5. **Registro**: atualizar changelog de segurança e planilha de rotação (armazenada no drive corporativo).

## 4. Gestão de incidentes

### 4.1 Detecção

* Alertas de observabilidade (`docs/observability/alertas.md`) devem acionar canal `#incidentes-moveongs`.
* Logs centralizados em CloudWatch devem ter filtros para erros críticos (`AppError`, `Unhandled error`).

### 4.2 Resposta

1. **Classificação**: incident commander (IC) designado avalia severidade (S0 a S3) e convoca squads necessários.
2. **Comunicação**: atualizar canal público a cada 30 minutos ou quando houver mudança relevante. Informar clientes internos via e-mail template.
3. **Mitigação**: seguir runbooks em `docs/observability/runbooks/` (ex.: `api-disponibilidade.md`, `database-pool.md`).
4. **Escalonamento**: envolver provedores (AWS Support) quando impacto > 1h ou dados sensíveis comprometidos.

### 4.3 Pós-incidente

* Realizar post-mortem em até 5 dias úteis, registrando causa raiz, métricas de MTTR/MTTA e ações preventivas.
* Atualizar este guia ou runbooks quando novos aprendizados surgirem.

## 5. Onboarding operacional

1. **Documentação base**: revisar `docs/observability/README.md`, `docs/openapi/v1/openapi.yaml` e este guia.
2. **Acesso**: solicitar inclusão nos grupos AWS (`moveongs-ops`) e no Grafana.
3. **Ambiente local**: executar `npm install`, `npm run check` e `npm run seed` (com `SEED_DEMO_DATA=true`) para familiarização com dados demo.
4. **Checklist de shadowing**:
   - Acompanhar execução de um deploy (`.github/workflows/deploy.yml`).
   - Simular recuperação de snapshot dev.
   - Validar rotação de `JWT_SECRET` em ambiente de teste.

## 6. Referências rápidas

* **Infraestrutura**: `infra/terraform/README.md`
* **Backlog de governança**: `docs/backlog-codex.md`
* **Runbooks e SLOs**: diretório `docs/observability/`
* **Contato emergência**: `incident-response@moveongs.org`

> Mantenha este documento versionado. Alterações operacionais só são válidas após merge em `main` e comunicação aos times afetados.
