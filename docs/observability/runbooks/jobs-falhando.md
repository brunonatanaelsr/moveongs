# Runbook — CriticalQueueFailures

## Contexto

O alerta indica que a taxa de falhas dos jobs críticos ultrapassou 5% na janela de 15 minutos. Impacta diretamente fluxos assíncronos (envio de notificações, billing, etc.).

## Detecção

* Alerta: `CriticalQueueFailures` (`severity=warning`).
* Métricas: `moveongs_job_failures_total`, `moveongs_job_processed_total` (exportadas pelos workers).
* Logs: buscar por `event=job_failed` com `queue=critical`.

## Diagnóstico rápido

1. Verifique se há lotes específicos falhando (mesmo `job_name`?).
2. Consulte logs do worker responsável (`kubectl logs`, `ecs logs`).
3. Analise traces (caso os jobs emitam spans customizados) para identificar pontos de falha.
4. Cheque dependências usadas pelo job (APIs externas, banco, storage). Estão retornando erro/timeout?
5. Confirme se houve mudança recente no código do job ou nas configurações de fila (ex.: retries, DLQ).

## Mitigação

* Pause a fila (`bull`, `sqs`, etc.) para evitar retrials agressivos que agravem o problema.
* Reprocessar mensagens válidas manualmente após corrigir a causa.
* Se a falha for externa, implementar fallback temporário (ex.: enfileirar em DLQ, armazenar em S3 para reprocessamento posterior).
* Ajustar número de retries/backoff para reduzir pressão enquanto corrige a causa raiz.
* Escalar horizontalmente o worker se o problema for saturação de CPU/IO.

## Follow-up

1. Adicionar testes automatizados cobrindo o cenário que causou a falha.
2. Atualizar documentação do job (payload, dependências, limites).
3. Se aplicável, revisar política de DLQ e garantir limpeza/apropriação do backlog.
