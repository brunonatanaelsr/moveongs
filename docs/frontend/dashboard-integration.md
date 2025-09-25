# Dashboard IMM — Checklist de Integração

Este guia consolida as verificações realizadas no frontend (`apps/dashboard`) e os próximos passos para finalizar a entrega do dashboard institucional.

## 1. Variáveis de ambiente do frontend

O dashboard consome a API Fastify usando `NEXT_PUBLIC_API_URL`. Um arquivo `.env.example` foi incluído no projeto para simplificar a configuração local e em staging.

| Ambiente        | Valor sugerido                      | Observações |
| --------------- | ----------------------------------- | ----------- |
| Desenvolvimento | `http://localhost:3333`             | Porta padrão do backend rodando via `npm run dev` ou Docker Compose. |
| Staging         | `https://staging.api.moveongs.org`  | Ajustar conforme a URL pública configurada no deploy. |
| Produção        | `https://api.moveongs.org`          | Garantir HTTPS e mapeamento correto no reverse proxy. |

1. Copie `apps/dashboard/.env.example` para `apps/dashboard/.env`.
2. Atualize `NEXT_PUBLIC_API_URL` de acordo com o ambiente alvo.
3. Reinicie o servidor Next.js para que o valor seja propagado aos hooks (`fetchJson`).

## 2. Validação do fluxo de autenticação

### Cobertura automatizada

- O teste `apps/dashboard/tests/Login.test.tsx` garante:
  - Validação de campos obrigatórios.
  - Tratamento do fluxo de MFA.
  - Persistência da sessão e redirecionamento pós-login.
- O novo teste `apps/dashboard/tests/session.test.ts` cobre armazenamento (`localStorage`) e os eventos de sincronização usados pelo hook `useSession`.

Execute os testes com:

```bash
cd apps/dashboard
npm run test
```

### Roteiro manual sugerido

1. Acesse `/(auth)/login` e realize login com credenciais válidas.
2. Verifique se a sessão é persistida em `localStorage` sob a chave `imm:session`.
3. Abra outra aba do navegador e confirme se o dashboard reconhece a sessão automaticamente (escuta do evento `imm:session-changed`).
4. Remova a sessão (logout ou limpeza manual) e valide se o usuário é redirecionado para `/login`.

## 3. Mapa de integrações do dashboard

| Bloco / Hook                              | Endpoint previsto                                      | Status atual | Observações |
| ----------------------------------------- | ------------------------------------------------------- | ------------ | ----------- |
| `useAnalyticsOverview`                    | `GET /analytics/overview`                               | ✅ Pronto    | Alimenta KPIs, gráficos e listas principais do dashboard. |
| `useAnalyticsTimeseries`                  | `GET /analytics/timeseries?metric=...`                  | ✅ Pronto    | Usa filtros globais para renderizar as séries temporais. |
| `useProjects`                             | `GET /projects`                                         | ✅ Pronto    | Popula filtros de projetos. Confirmar paginação/escopo RBAC. |
| `useCohorts`                              | `GET /projects/:projectId/cohorts`                      | ⚠️ Verificar | Endpoint precisa garantir filtro por permissões e paginação. |
| `ExportButtons`                           | `GET /analytics/export?format=csv|pdf`                  | ✅ Pronto    | Já implementado no backend; requer token válido. |
| `RiskTable` / `ConsentTable`              | Incluídos em `GET /analytics/overview`                  | ✅ Pronto    | Depende do payload de `listas` no overview. |
| `MessageCenter`                           | `GET /messages`, `GET /messages/:id`                    | 🚧 Pendente | UI mockada. Necessário definir modelo (threads, anexos, status). |
| `InstitutionalFeed`                       | `GET /institutional-feed`                               | 🚧 Pendente | Conteúdo fictício. Implementar integração com CMS/notifications. |
| `ActionPlanPanel`                         | `GET /action-plans`, `PATCH /action-plans/:id`          | 🚧 Pendente | Dados mock. Deve conversar com engine de planos/consentimentos. |
| Uploads/Anexos em mensagens e consentimento | `POST /files`, `GET /files/:id` (S3)                    | 🚧 Pendente | Depende do módulo de anexos em implementação. |

### Próximas ações recomendadas

1. Confirmar com o backend o contrato de `GET /projects/:projectId/cohorts` (paginação, filtros adicionais).
2. Priorizar as rotas de mensagens/feed/anexos para substituir os dados mockados, alinhando com o roadmap de notificações.
3. Criar mocks de API (MSW ou interceptadores SWR) para desenvolvimento offline enquanto as rotas pendentes são concluídas.

## 4. Plano de testes integrados

- **React Testing Library + MSW**: simular respostas dos endpoints críticos (`/analytics/overview`, `/analytics/timeseries`, `/projects`). Cobrir renderização do dashboard com filtros aplicados.
- **Playwright/Cypress (E2E)**:
  1. Fluxo de login + carregamento do overview (cenário feliz).
  2. Usuário sem permissão `analytics:read` → redirecionamento/controlar acesso.
  3. Exportação CSV/PDF com verificação de download iniciado.
- **Contratos Backend-Frontend**: adicionar testes de contrato (pode ser via `vitest` no backend) para garantir estabilidade dos payloads usados pelo frontend.

Com esses passos, o dashboard fica alinhado às necessidades do Instituto Move Marias e pronto para conectar novas funcionalidades (mensagens, anexos e formulários dinâmicos).
