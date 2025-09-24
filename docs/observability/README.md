# Observabilidade

Este documento descreve o padrão de observabilidade adotado para a API do MoveONgs. Ele abrange logs estruturados, métricas, tracing distribuído, SLOs/SLIs e a forma de operar alertas e incidentes.

## Visão geral da arquitetura

| Domínio       | Ferramentas/Protocolos | Responsabilidade principal |
| ------------- | ---------------------- | -------------------------- |
| Logs          | Pino (JSON) + Correlation IDs | Diagnóstico operacional e auditoria |
| Métricas      | OpenTelemetry SDK → OTLP | Saúde de infraestrutura e SLIs |
| Tracing       | OpenTelemetry SDK → OTLP | Observação ponta a ponta das requisições |
| Dashboards    | Grafana/Loki/Tempo (sugerido) | Visualização unificada |
| Alertas       | Alertmanager/FireHydrant/PagerDuty (sugerido) | Incidentes e on-call |

Todos os sinais exportam via OTLP/HTTP (`/v1/traces` e `/v1/metrics`), permitindo integrar com Grafana Cloud, Tempo, Prometheus, Honeycomb, Lightstep ou outra solução compatível.

## Logs estruturados com correlação

* Todos os logs são emitidos em JSON através do [Pino](https://getpino.io) com campos padrão `service`, `environment`, `version` e `message`.
* A cada requisição HTTP um `correlation_id` é gerado (ou reutilizado a partir do header `x-request-id`) e propagado automaticamente para todos os logs emitidos durante o ciclo de vida da requisição.
* Se o tracing estiver habilitado, os campos `trace_id` e `span_id` são injetados automaticamente em cada evento de log.
* O header `x-request-id` é devolvido na resposta para facilitar investigações cross-service.

### Boas práticas

* Use `request.log` dentro de handlers Fastify para incluir contexto adicional (ex.: `request.log.info({ orderId }, 'order created')`).
* Para jobs em background ou scripts, inicie o log com `setLogContext({ correlation_id: <id> })` caso precise correlacionar eventos manualmente.
* Evite logs multiline ou com payloads muito grandes; prefira resumir e, se necessário, armazenar dados brutos em storage dedicado.

## Métricas e tracing via OpenTelemetry

A aplicação inicializa o [OpenTelemetry NodeSDK](https://opentelemetry.io/docs/instrumentation/js) durante o bootstrap do servidor (`src/server.ts`). O SDK ativa instrumentações automáticas para HTTP, PostgreSQL (`pg`), Redis (`ioredis`), entre outros pacotes suportados.

### Configuração

As principais variáveis estão listadas em `.env.example`:

* `OTEL_ENABLED` — ativa/desativa a instrumentação.
* `OTEL_SERVICE_NAME` — nome lógico do serviço (usado em métricas e tracing).
* `OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_EXPORTER_OTLP_HEADERS` — destino do coletor.
* `OTEL_METRICS_EXPORT_INTERVAL_MS` e `OTEL_METRICS_EXPORT_TIMEOUT_MS` — configuração de exportação de métricas.
* `OTEL_TRACES_SAMPLER` e `OTEL_TRACES_SAMPLER_ARG` — controle de amostragem (ex.: `traceidratio` com `0.1`).

### Métricas expostas

| Métrica                                   | Descrição                                                      |
| ----------------------------------------- | -------------------------------------------------------------- |
| `http.server.duration`                    | Histograma de latência (ms) por rota, método e código HTTP.     |
| `http.server.active_requests`             | Gauge com requisições em andamento.                             |
| `db.client.connections.usage`             | Número de conexões PostgreSQL por pool.                         |
| `db.client.operation.duration`            | Latência de queries PostgreSQL.                                 |
| `redis.client.operation.duration`         | Latência de comandos Redis.                                     |
| `process.runtime.node.cpu.utilization`    | Utilização de CPU do processo Node.                             |
| `process.runtime.node.memory.usage`       | Uso de memória residente e heap.                                |

Outras métricas padrão de runtime (GC, event loop, etc.) também ficam disponíveis para SLIs.

### Tracing

* Cada requisição HTTP gera um trace com spans para middlewares e chamadas externas (PostgreSQL, Redis, HTTP clients).
* Atributos importantes: `http.request_id`, `http.route`, `db.statement` (truncado conforme configuração do driver) e `exception.stacktrace` em caso de erros.
* Use `trace.getActiveSpan()` nos serviços para adicionar eventos customizados quando necessário.

## SLOs e SLIs

Os objetivos de serviço estão detalhados em [`slos.md`](./slos.md). Resumo rápido:

* **Disponibilidade da API**: 99.5% mensal (baseado em `http.server.duration` e códigos >= 500).
* **Latência p95**: ≤ 400 ms para rotas críticas (`/sessions`, `/orders/*`).
* **Taxa de erros de fila**: < 1% em jobs críticos.

## Alertas e runbooks

Os procedimentos operacionais estão documentados em [`runbooks`](./runbooks). Cada alerta mapeia 1:1 com um runbook contendo passos de diagnóstico, mitigação e contato.

### Sugestão de pipeline de alertas

1. Prometheus/Grafana Agent recebe métricas e aplica regras de alerta (ver [alertas.md](./alertas.md)).
2. Alertmanager envia notificações para Slack + PagerDuty (horário comercial) ou ligações (fora do horário).
3. FireHydrant (ou similar) registra o incidente e referencia o runbook correspondente.

## Dashboards de referência

* **Visão geral (Service Overview)** — latência p50/p95, taxa de erro, tráfego por rota.
* **Banco de dados** — throughput, conexões, filas no pool e slow queries.
* **Dependências externas** — dashboards específicos para Redis, provedores externos e filas.

## Próximos passos

* Habilitar amostragem adaptativa baseada em load após coletar dados reais.
* Incluir tracing manual em pontos de negócio (ex.: geração de boletos, sincronização com gateways).
* Alimentar catálogos de eventos (DataDog Service Catalog / Backstage) para on-call.
