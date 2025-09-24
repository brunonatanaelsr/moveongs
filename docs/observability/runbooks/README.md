# Runbooks de operação

Os runbooks deste diretório cobrem os principais alertas definidos em [`../alertas.md`](../alertas.md). Cada documento segue o formato:

1. **Detecção** — como o alerta é disparado e quais métricas observar.
2. **Diagnóstico** — checklist de investigações.
3. **Mitigação** — ações de curto prazo.
4. **Follow-up** — passos pós-incidente.

Runbooks disponíveis:

| Alerta                                     | Runbook                                               |
| ------------------------------------------ | ----------------------------------------------------- |
| ApiAvailabilityBudgetBurn                  | [api-disponibilidade.md](./api-disponibilidade.md)    |
| ApiLatencyP95Sessions                      | [api-latencia.md](./api-latencia.md)                  |
| DatabasePoolExhaustion                     | [database-pool.md](./database-pool.md)                |
| CriticalQueueFailures                      | [jobs-falhando.md](./jobs-falhando.md)                |
