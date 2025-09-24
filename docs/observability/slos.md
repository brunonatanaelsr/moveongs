# SLOs e SLIs do MoveONgs API

Este documento define os principais indicadores de confiabilidade (SLIs) e seus respectivos objetivos (SLOs). As métricas são derivadas da instrumentação padrão do OpenTelemetry e do Fastify.

## Sumário executivo

| Serviço/Fluxo                  | SLI principal                 | SLO                              | Janela de avaliação |
| ------------------------------ | ----------------------------- | -------------------------------- | ------------------- |
| API HTTP (todas as rotas)      | Disponibilidade               | ≥ 99.5%                          | 30 dias             |
| Login e criação de sessão      | Latência p95 (`/sessions`)    | ≤ 400 ms                         | 30 dias             |
| Checkout / criação de pedidos  | Latência p95 (`/orders/*`)    | ≤ 600 ms                         | 30 dias             |
| API HTTP                       | Taxa de erros 5xx             | < 1% das requisições             | 30 dias             |
| Jobs de fila críticos          | Taxa de falhas                | < 1% dos jobs                    | 7 dias              |
| Banco de dados PostgreSQL      | Saturação do pool de conexões | < 80% do `max_connections` médio | 7 dias              |

## Detalhamento dos SLIs

### Disponibilidade da API

* **Cálculo:** `(total_requests - requests_5xx) / total_requests`.
* **Fonte:** Métrica `http.server.duration` com labels `http.response_status_code`.
* **Exceções:** Rotas `/health` e `/metrics` não contam para o objetivo (utilize label `http.route`).
* **Alertas:** ver [alertas.md](./alertas.md#disponibilidade-da-api).

### Latência p95

* **Cálculo:** Percentil 95 do histograma `http.server.duration` por rota.
* **Estratégia:** Aplicar filtros específicos para rotas críticas (`/sessions`, `/orders/*`).
* **Observações:** Monitorar também p50/p99 para identificar caudas longas.

### Taxa de erros 5xx

* **Cálculo:** `sum(rate(http.server.duration_count{http.response_status_code>=500}[5m])) / sum(rate(http.server.duration_count[5m]))`.
* **Objetivo:** < 1% na janela de 30 dias.
* **Mitigação:** rollback de deploys, feature flags, escala horizontal.

### Jobs de fila

* **Cálculo:** `failed_jobs / total_jobs` (métrica customizada a ser emitida pelos workers; incluir no roadmap).
* **Observações:** Enquanto a métrica não é implementada, monitore logs com `event=job_failed` como proxy.

### Saturação de banco de dados

* **Cálculo:** média do `db.client.connections.usage` dividida pelo limite configurado para o pool.
* **Objetivo:** manter abaixo de 80% para evitar filas e timeouts.

## Gestão do erro orçamentário (error budget)

| SLO                      | Error budget mensal | Ação quando 25% consumido | Ação quando 50% consumido | Ação quando 75% consumido |
| ------------------------ | ------------------- | ------------------------- | ------------------------- | ------------------------- |
| Disponibilidade 99.5%    | ~3h 39min de indisponibilidade | Congelar deploys não emergenciais, revisar incidentes recentes | Aprovar apenas hotfixes críticos e elevar alerta para diretoria | Iniciar "feature freeze", focar em confiabilidade |
| Latência p95 sessões     | 400 ms             | Revisar dashboards de performance e traces | Priorizar otimizações de queries/cache | Considerar rollback de mudanças recentes |

## Operacionalização

1. Os SLOs devem ser revistos trimestralmente em conjunto com produto e engenharia.
2. Dashboards e alertas devem utilizar os mesmos filtros/labels definidos aqui para evitar divergências.
3. Incidentes relevantes devem mencionar o impacto em SLOs no post-mortem.
