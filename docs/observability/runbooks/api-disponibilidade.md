# Runbook — ApiAvailabilityBudgetBurn

## Contexto

O alerta **ApiAvailabilityBudgetBurn** sinaliza aumento abrupto de erros 5xx na API, indicando possível consumo acelerado do error budget de disponibilidade.

## Detecção

* Alertmanager/PagerDuty: `severity=critical`.
* Métrica: `http_server_duration_count` filtrado por `http.response_status_code=5xx`.
* Dashboards relevantes: "Service Overview" (latência, taxa de erro) e "Dependências externas".

## Diagnóstico rápido

1. Verifique o status geral da aplicação: `kubectl get pods` / `docker service ls` / `ecs-cli compose ps` (dependendo do ambiente).
2. Abra os logs mais recentes com o `correlation_id` informado no alerta e identifique mensagens de erro recorrentes.
3. Consulte traces no Tempo/Jaeger para rotas com maior erro.
4. Cheque o status de dependências:
   * PostgreSQL acessível? (`psql <DATABASE_URL> -c 'select 1'`).
   * Redis saudável? (`redis-cli -u $REDIS_URL ping`).
   * Serviços externos com SLA degradado?
5. Verifique deploys recentes (CI/CD) e feature flags habilitadas.

## Mitigação

* **Erro de aplicação/regressão:** realize rollback do último deploy ou desative feature flag problemática.
* **Problemas de infraestrutura:** escale horizontalmente o serviço (replicas adicionais) e avalie limites de CPU/memória.
* **Dependência externa indisponível:** aplique circuit breaker (se disponível) ou reduza chamadas com feature flag.
* **Banco fora do ar:** inicie failover, contate o time de dados, avalie restaurar snapshots.

Durante a mitigação, mantenha o canal de incidentes atualizado a cada 15 minutos.

## Follow-up

1. Abra incidente no sistema padrão (FireHydrant/Jira) com resumo do impacto.
2. Documente linha do tempo e ações tomadas.
3. Atualize gráficos e alertas caso haja gaps de monitoramento.
4. Agende post-mortem em até 48h.
