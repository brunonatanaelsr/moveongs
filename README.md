# IMM Backend (Move Marias)

Backend do mini-ERP social do Instituto Move Marias. Entrega autenticação JWT, RBAC por papéis/permissões, cadastros de beneficiárias, módulos de projetos/matrículas, serviços de formulários e analytics.
Consulte a especificação funcional & técnica completa (v0.1) em [`docs/specification.md`](docs/specification.md).

## Requisitos

- Node.js 20+
- PostgreSQL 14+
- (Opcional) Redis para cache dos relatórios (`REDIS_URL`)

## Configuração rápida

1. Instale dependências:
   ```bash
   npm install
   ```
2. Rode as migrações / seeds (em ordem):
   ```bash
   psql $DATABASE_URL -f artifacts/sql/0001_initial.sql
   psql $DATABASE_URL -f artifacts/sql/0002_rbac_and_profiles.sql
   psql $DATABASE_URL -f artifacts/sql/0003_analytics_views.sql
   psql $DATABASE_URL -f artifacts/sql/0007_attachment_antivirus.sql
   npm run seed        # usa SEED_DEMO_DATA=false por padrão
   ```
   Para gerar dados demonstrativos (projetos/turmas/presenças/planos):
   ```bash
   SEED_DEMO_DATA=true npm run seed
   ```
3. Copie `.env.example` para `.env` e ajuste variáveis (DB, JWT, Redis, etc.).
4. Ambiente de desenvolvimento:
   ```bash
   npm run dev
   ```

### Observabilidade e operação

* Logs, métricas, tracing, SLOs e runbooks documentados em [`docs/observabilidade`](docs/observabilidade/README.md).
* Variáveis essenciais já presentes em `.env.example` (`OTEL_*`, `LOG_LEVEL`, `OTEL_ENABLED`).
* Requisições HTTP devolvem o header `x-request-id` e todos os logs carregam `correlation_id`, `trace_id` e `span_id`.

### Segurança & privacidade

* Campos PII/PHI são cifrados no banco com `pgcrypto` e chaves efêmeras geradas via AWS KMS (ver `PII_ENCRYPTION_KMS_KEY_ID`).
* Secrets de aplicação vivem no AWS Secrets Manager com KMS dedicado (`alias/<projeto>-app`) e podem ser injetados via Vault local (`SECRET_VAULT_PATH`).
* Respostas HTTP e logs passam por mascaramento automático (`maskSensitiveData`) para ocultar CPF, RG, tokens e contatos.
* Anexos são armazenados em bucket S3 dedicado com criptografia `aws:kms`, versionamento e bloqueio total de acesso público. Escaneamento antivírus e fluxo operacional documentados em [`docs/security/antivirus-scanning.md`](docs/security/antivirus-scanning.md).

## Ambientes via Docker Compose

Arquivos de orquestração completos estão na pasta [`deploy/`](deploy/):

| Arquivo                      | Uso principal                                                     |
| ---------------------------- | ----------------------------------------------------------------- |
| `docker-compose.dev.yml`     | Desenvolvimento local com hot reload + Postgres, Redis e stack de observabilidade completa.
| `docker-compose.staging.yml` | Ambiente staging self-hosted (usa imagem publicada + observabilidade).
| `docker-compose.prod.yml`    | Produção com API, OpenTelemetry Collector e Caddy como reverse proxy.

Exemplos:

```bash
# Dev (hot reload)
docker compose -f deploy/docker-compose.dev.yml up --build

# Staging (imagem publicada)
IMAGE=ghcr.io/your-org/moveongs:staging docker compose -f deploy/docker-compose.staging.yml up -d

# Produção (usa envs para DB/Redis/TLS)
TLS_EMAIL=infra@your-domain.com DATABASE_URL=... REDIS_URL=... JWT_SECRET=... \
  docker compose -f deploy/docker-compose.prod.yml up -d
```

## CI/CD

* [`ci.yml`](.github/workflows/ci.yml) executa `npm ci`, `npm run check`, `npm test` e `npm run build`, além de validar o Dockerfile.
* [`deploy.yml`](.github/workflows/deploy.yml) builda e publica a imagem no GHCR e faz deploy via SSH + Docker Compose para staging e produção.
* Configure os segredos (`STAGING_SSH_HOST`, `STAGING_SSH_USER`, `PROD_SSH_HOST`, etc.) e variáveis (`STAGING_PUBLIC_URL`, `PRODUCTION_PUBLIC_URL`) no GitHub.

## Infraestrutura como código

* Terraform modular em [`infra/terraform`](infra/terraform) provisiona VPC, ECS Fargate, RDS, ElastiCache, ALB e Route53.
* Utilize os `terraform.tfvars` por ambiente (`environments/dev|staging|prod`) e ajuste `container_image`, secrets e dimensões conforme necessário.
* Secrets sensíveis (JWT, DATABASE_URL, REDIS_URL) são armazenados no AWS Secrets Manager cifrados com KMS dedicada e injetados automaticamente na task definition.
* Bucket `*-attachments` com versionamento, política `SecureTransport` e criptografia KMS é exposto via variáveis de ambiente (`ATTACHMENTS_STORAGE=s3`, `S3_BUCKET`, `S3_SERVER_SIDE_ENCRYPTION`).

## Scripts disponíveis

- `npm run dev` – Fastify com recarga (`tsx`).
- `npm run build` – compila TypeScript para `dist/`.
- `npm run start` – executa a versão buildada.
- `npm run check` – checagem de tipos.
- `npm run seed` – popula papéis, vulnerabilidades, recursos/permissões e usuário admin (opcionalmente dados demo).
- `npm test` – testes de integração/analytics.

## Estrutura principal

- `src/app.ts` / `src/modules/*` – API Fastify (auth, usuários, beneficiárias, projetos, matrículas, analytics, etc.).
- `src/scripts/seed.ts` – seeds idempotentes com opção de dataset demo.
- `artifacts/sql/` – migrações (`0001` base, `0002` RBAC/perfis sociais, `0003` views de analytics, `0007` antivírus de anexos).
- `artifacts/policies.example.json` – exemplo de mapa de permissões para guards front/back.
- `frontend_glass_ui_examples/` – componentes React (Tailwind) com visual “liquid glass” + `PermissionGuard`.
- `tools/pdf-renderer/` – microserviço Node (Playwright + Handlebars) para gerar PDFs (ex.: recibos e dashboard).
- Variáveis `FORM_VERIFICATION_BASE_URL` e `FORM_VERIFICATION_HASH_SECRET` habilitam QR codes e hashes de verificação nos PDFs assinados.
- `apps/dashboard/` – esqueleto Next.js do dashboard institucional (filtros, gráficos, exportações CSV/PDF).
- `src/modules/notifications` – fila de disparos externos (e-mail/WhatsApp) e webhooks configuráveis.

## Analytics e Dashboard

- Rotas `/analytics/overview`, `/analytics/timeseries` e `/analytics/projects/:id` exigem permissões `analytics:read` (admin/coordenacao/tecnica) ou `analytics:read:project` (educadora limitada aos projetos atribuídos).
- Configure `REDIS_URL` (e opcionalmente `CACHE_TTL_SECONDS`) para habilitar cache de 5 minutos das respostas.
- Exportação: `GET /analytics/export?format=csv|pdf` — filtros `from`, `to`, `projectId`, `cohortId` respeitados.
- Dados demo (`SEED_DEMO_DATA=true`) criam 2 projetos, turmas, presenças de 12 semanas, vulnerabilidades, consentimentos (incluindo revogados) e planos de ação com status variados.

## PDF renderer

- O serviço em `tools/pdf-renderer/` (Playwright + Handlebars) gera relatórios. Após instalar dependências na pasta, execute:
  ```bash
  node render_pdf.js templates/dashboard_summary.hbs data.json out.pdf
  ```
- Utilizado pelo endpoint `/analytics/export?format=pdf` via `src/modules/analytics/export.ts`.
- Os formulários exportados agora trazem hash SHA-256 e QR code opcional apontando para `FORM_VERIFICATION_BASE_URL`; utilize `FORM_VERIFICATION_HASH_SECRET` para garantir integridade dos recibos.

## Testes

- Backend: `npm test` (Vitest + pg-mem) cobre autenticação e rotas de analytics (RBAC, exportações, cache).
- Ajuste `RESPONSE_MASKING_ENABLED=false` nos ambientes de teste/local caso precise validar respostas sem mascaramento automático de dados sensíveis; mantenha o padrão (`true`) em produção.
- Dashboard: `apps/dashboard` possui testes com React Testing Library (`npm test` dentro do app).

## Notificações e webhooks

- Configure canais padrão através das variáveis de ambiente:
  - `NOTIFICATIONS_EMAIL_FROM` (remetente) e `NOTIFICATIONS_EMAIL_RECIPIENTS` (lista separada por vírgula).
  - `NOTIFICATIONS_WHATSAPP_NUMBERS` para números internacionais (ex.: `+5521999999999`).
  - `NOTIFICATIONS_WEBHOOK_TIMEOUT_MS` e `NOTIFICATIONS_WEBHOOK_SECRET` para chamadas HTTP assíncronas.
- Endpoints protegidos (`/notifications/webhooks`) permitem listar, cadastrar e remover webhooks por evento chave.
- Eventos de matrículas, presenças e consentimentos alimentam automaticamente fila de envios multi canal.
- Visão detalhada de arquitetura, observabilidade e reprocessamento em [`docs/notifications/README.md`](docs/notifications/README.md).

## Próximos passos sugeridos

- Conectar o frontend `/dashboard` aos ambientes reais (configurar `NEXT_PUBLIC_API_URL`).
- Expandir endpoints para feed/mensagens, planos de ação completos e notificações.
- Consultar o [Backlog CODEx — Cobertura da Especificação IMM](docs/backlog-codex.md) para planejamento detalhado de epics e stories.

## Licença

Projeto interno do Instituto Move Marias.
