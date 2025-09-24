# Guia de análise avançada de falhas

## Objetivo

Orientar a investigação de incidentes complexos que envolvem múltiplos serviços, filas críticas e dependências externas do MoveONgs, reduzindo o tempo até a identificação da causa raiz e mitigando impactos recorrentes.

## Pré-requisitos

* Acesso aos dashboards do Grafana/Loki/Tempo com as permissões adequadas.
* Conhecimento dos SLOs vigentes (consulte [`slos.md`](./slos.md)).
* Acesso de leitura aos repositórios e feature flags para confirmar deploys recentes.
* Ferramentas de colaboração para incidentes (FireHydrant/PagerDuty/Slack) ativas.

## Checklist inicial

1. **Confirme o estado do alerta/incident:** copie o ID do alerta e valide o horário e o escopo (serviço, ambiente) para evitar duplicidade de investigações.
2. **Classifique o impacto:** identifique fluxos de negócio afetados (API pública, fila crítica, sincronização externa) e compare com os SLOs afetados.
3. **Defina a janela temporal:** foque na janela de disparo do alerta e adicione margens (−15/+15 minutos) para encontrar eventos correlatos.
4. **Verifique mudanças recentes:** consulte o changelog/deploy board para identificar releases ou feature flags ativadas na mesma janela.

## Coleta de sinais

| Tipo       | Onde buscar                                                                 | O que observar                                                                                                         |
| ---------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Métricas   | Dashboards de serviço (latência, taxa de erro), `moveongs_job_*`, métricas de runtime (`process.runtime.*`) | Quebras de tendência, saturação de CPU/memória, taxa de retries, filas crescendo, spikes de `failed` vs `processed`. |
| Logs       | Loki/Elastic filtrando por `service`, `environment`, `event=job_failed` ou `level>=error`                | Códigos de erro, payloads rejeitados, correlação com `correlation_id` e `trace_id`.                                   |
| Traces     | Tempo/Jaeger filtrando por `http.route`, `job_name`, `status != OK`                                        | Spans com maior duração, dependências externas com erros, gaps (spans ausentes).                                     |
| Infra      | Painéis de Kubernetes/Infra (CPU, memória, I/O, conexões DB)                                              | Restarts, throttling, exaustão de pool de conexões (`db.client.connections.usage`).                                   |
| Dependências externas | Dashboards de provedores (gateway de pagamento, provedores de e-mail/whatsapp)                | Janelas de indisponibilidade, rate limits, mudanças de contrato.                                                      |

## Sequência recomendada

1. **Estabeleça a linha de base**: abra os dashboards históricos para comparar o período do incidente com períodos saudáveis; observe desvios em percentis p95/p99 e em contadores acumulados.
2. **Aperte o escopo**: use labels de métricas (`service`, `queue`, `job_name`, `channel`) para isolar o componente responsável. Ex.: compare `moveongs_job_failures_total{queue="critical"}` com `moveongs_job_processed_total` por job.
3. **Correlacione logs e traces**: a partir de um `correlation_id` ou `trace_id`, navegue até os spans envolvidos para identificar dependências externas e latência acumulada. Verifique eventos `exception` registrados nos spans.
4. **Revise o estado da infraestrutura**: confirme se há pods reiniciando, saturação de CPU/memória ou limits atingidos. Consulte o consumo de conexões no PostgreSQL e a fila de mensagens (SQS/Bull) para detectar backlog crescente.
5. **Valide hipóteses com experimentos controlados**: reprocesse um item da fila em ambiente de staging ou use `curl`/`k6` para reproduzir o padrão de erro. Documente cada experimento para acelerar o handover.
6. **Analise dependências externas**: compare as métricas internas com incidentes publicados pelos provedores ou com dashboards exportados por eles. Caso haja SLA violado, abra ticket e registre no relato do incidente.
7. **Verifique efeitos colaterais**: identifique filas secundárias, jobs agendados ou notificações que possam ser impactados e alinhe com stakeholders sobre contingências (ex.: habilitar fallback para WhatsApp → SMS).

## Critérios de encerramento

* Causa raiz identificada e categorizada (bug, regressão, saturação, dependência externa, operação manual).
* Mitigação aplicada ou plano de correção com responsável e prazo definidos.
* Indicadores retornaram à linha de base e alertas cessaram por pelo menos duas janelas de monitoramento.
* Post-mortem inicial preenchido (resumo, linha do tempo, ações imediatas, ações de longo prazo).

## Follow-up pós-incidente

1. Atualize ou crie runbooks específicos caso lacunas tenham sido identificadas durante a investigação.
2. Revise cobertura de testes e inclua cenários que reproduzam a falha sempre que possível.
3. Avalie se novos painéis, métricas customizadas (`NotificationMetrics`, backlog por canal, etc.) ou alertas são necessários.
4. Compartilhe os aprendizados em retrospectivas e registre indicadores de MTTR/MTBF.
