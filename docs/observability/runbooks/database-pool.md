# Runbook — DatabasePoolExhaustion

## Contexto

O alerta indica que o pool de conexões PostgreSQL está próximo do limite configurado. Se não tratado, a aplicação pode sofrer timeouts ou filas elevadas.

## Detecção

* Alerta: `DatabasePoolExhaustion` (`severity=critical`).
* Métricas primárias: `db_client_connections_usage`, `db_client.connections.max`, `db_client_connections_pending_requests`.
* Logs correlatos: "database pool error", "timeout acquiring client".

## Diagnóstico rápido

1. Inspecione o dashboard de banco e verifique uso de CPU/Memória no RDS/CloudSQL.
2. Execute `SELECT state, count(*) FROM pg_stat_activity GROUP BY 1;` para identificar sessões em espera.
3. Verifique se existe aumento repentino de requisições (tráfego legítimo) via `http.server.duration_count`.
4. Procure por queries lentas (`pg_stat_statements`, `EXPLAIN (ANALYZE)` nos traces).
5. Confirme que workers/batches não estão abrindo conexões sem fechar (leak).

## Mitigação

* Reduza temporariamente `PGPOOL_MAX` em outros serviços concorrentes para liberar slots.
* Aplique `statement_timeout` menor para derrubar queries travadas.
* Escale verticalmente o banco (mais vCPUs/RAM) ou habilite read replicas se o workload for de leitura.
* Otimize queries problemáticas (crie índices, reescreva joins, limitações) como hotfix.
* Se necessário, habilite fila de requisições no Fastify limitando throughput para proteger o banco.

## Follow-up

1. Validar se configurações de pool (max, idle timeout) estão alinhadas com recursos do banco.
2. Revisar código que mantém transações longas ou conexões abertas por muito tempo.
3. Registrar melhorias permanentes (adicionar caching, sharding) no backlog de plataforma.
