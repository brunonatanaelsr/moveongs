# Regras de alerta

As regras abaixo foram pensadas para Prometheus/Grafana Agent, mas podem ser adaptadas para outras soluções. Todas utilizam as métricas geradas pelo OpenTelemetry e os SLOs descritos em [`slos.md`](./slos.md).

## Disponibilidade da API

```yaml
- alert: ApiAvailabilityBudgetBurn
  expr: |
    (sum(rate(http_server_duration_count{http_response_status_code=~"5..",http_route!="/health"}[5m]))
      /
    sum(rate(http_server_duration_count{http_route!="/health"}[5m]))) > 0.02
  for: 10m
  labels:
    severity: critical
    service: moveongs-api
  annotations:
    summary: "Erro 5xx acima do limite (>=2% nos últimos 10m)"
    runbook_url: https://github.com/brunonatanaelsr/moveongs/blob/main/docs/observability/runbooks/api-disponibilidade.md
```

## Latência p95 (rotas críticas)

```yaml
- alert: ApiLatencyP95Sessions
  expr: |
    histogram_quantile(0.95,
      sum by (le) (
        rate(http_server_duration_bucket{http_route="/sessions"}[5m])
      )
    ) > 0.4
  for: 15m
  labels:
    severity: warning
    service: moveongs-api
  annotations:
    summary: "Latência p95 de /sessions acima de 400ms"
    runbook_url: https://github.com/brunonatanaelsr/moveongs/blob/main/docs/observability/runbooks/api-latencia.md
```

## Saturação do pool de banco de dados

```yaml
- alert: DatabasePoolExhaustion
  expr: avg(db_client_connections_usage{pool="default"}) > 0.8
  for: 10m
  labels:
    severity: critical
    service: moveongs-api
  annotations:
    summary: "Pool de conexões PostgreSQL acima de 80%"
    runbook_url: https://github.com/brunonatanaelsr/moveongs/blob/main/docs/observability/runbooks/database-pool.md
```

## Jobs de fila

```yaml
- alert: CriticalQueueFailures
  expr: |
    sum(increase(moveongs_job_failures_total{queue="critical"}[15m]))
      /
    sum(increase(moveongs_job_processed_total{queue="critical"}[15m])) > 0.05
  for: 15m
  labels:
    severity: warning
    service: moveongs-api
  annotations:
    summary: "Mais de 5% dos jobs críticos falharam nos últimos 15 minutos"
    runbook_url: https://github.com/brunonatanaelsr/moveongs/blob/main/docs/observability/runbooks/jobs-falhando.md
```

> **Nota:** as métricas `moveongs_job_failures_total` e `moveongs_job_processed_total` devem ser emitidas pelos workers/consumidores. Inclua-as na instrumentação quando os serviços de filas forem implementados.
