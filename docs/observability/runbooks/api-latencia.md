# Runbook — ApiLatencyP95Sessions

## Contexto

Este alerta aponta degradação na latência p95 das rotas de autenticação (`/sessions`). Normalmente causado por regressões de código, saturação de banco/cache ou dependências externas lentas.

## Detecção

* Alertmanager: `severity=warning` (eleva para `critical` se persistir > 1h).
* Métrica: `http_server_duration_bucket{http_route="/sessions"}`.
* Traços relevantes: `GET/POST /sessions` no Tempo/Jaeger.

## Diagnóstico rápido

1. Verifique se há deploy recente na janela do alerta (`git log`, histórico do CI/CD).
2. No dashboard de latência, confirme se o aumento ocorre em todas as réplicas ou apenas algumas.
3. Analise os traces de maior duração para identificar spans mais demorados (DB, HTTP externo, serialização).
4. Confira métricas de banco (`db.client.operation.duration`, saturação do pool) e cache (`redis.client.operation.duration`).
5. Inspecione filas internas ou serviços dependentes (ex.: gateway de pagamento) que possam estar lentos.

## Mitigação

* Se o problema estiver em queries pesadas, adicione índices temporários ou force planos otimizados.
* Cacheie respostas estáticas ou use TTL menor para dados sensíveis.
* Escale horizontalmente o banco/cache ou aumente `POOL_MAX` temporariamente (avaliar limites de recursos).
* Caso seja regressão clara, realize rollback ou desabilite feature flag introduzida.
* Considere ativar degradação graciosa (respostas simplificadas) para reduzir carga.

## Follow-up

1. Registrar incidente (mesmo sendo warning) se impactar conversão/logins.
2. Criar action items para otimização estrutural (melhorar índices, revisar fluxos de autenticação).
3. Atualizar testes de performance/regressão para cobrir caso identificado.
