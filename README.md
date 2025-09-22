# IMM Backend (Move Marias)

Backend do mini-ERP social do Instituto Move Marias. Entrega autenticação JWT, RBAC por papéis/permissões, cadastros de beneficiárias, módulos de projetos/matrículas, serviços de formulários e analytics.

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
- `artifacts/sql/` – migrações (`0001` base, `0002` RBAC/perfis sociais, `0003` views de analytics).
- `artifacts/policies.example.json` – exemplo de mapa de permissões para guards front/back.
- `frontend_glass_ui_examples/` – componentes React (Tailwind) com visual “liquid glass” + `PermissionGuard`.
- `tools/pdf-renderer/` – microserviço Node (Playwright + Handlebars) para gerar PDFs (ex.: recibos e dashboard).
- `apps/dashboard/` – esqueleto Next.js do dashboard institucional (filtros, gráficos, exportações CSV/PDF).

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

## Testes

- Backend: `npm test` (Vitest + pg-mem) cobre autenticação e rotas de analytics (RBAC, exportações, cache).
- Dashboard: `apps/dashboard` possui testes com React Testing Library (`npm test` dentro do app).

## Próximos passos sugeridos

- Conectar o frontend `/dashboard` aos ambientes reais (configurar `NEXT_PUBLIC_API_URL`).
- Expandir endpoints para feed/mensagens, planos de ação completos e notificações.
- Adicionar observabilidade (logs estruturados/métricas) e pipeline CI/CD.

## Licença

Projeto interno do Instituto Move Marias.
