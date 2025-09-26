# Notificações externas e integrações

Este módulo coordena os disparos automáticos de notificações externas quando eventos de domínio são publicados via `publishNotificationEvent`. Os disparos são executados de forma assíncrona e idempotente, com observabilidade e mecanismos de recuperação para cada canal suportado.

## Canais suportados

### E-mail
- Integração oficial com o SendGrid usando o SDK `@sendgrid/mail`, com autenticação via API key (`NOTIFICATIONS_EMAIL_SENDGRID_API_KEY`). O adapter normaliza metadados retornados (status HTTP, headers, `x-message-id`) e registra histórico detalhado a cada envio.【F:src/modules/notifications/adapters/email-adapter.ts†L1-L120】
- O remetente (`NOTIFICATIONS_EMAIL_FROM`) e os destinatários podem ser fornecidos pelo evento (ex.: reset de senha) ou via configuração padrão (`NOTIFICATIONS_EMAIL_DEFAULT_RECIPIENTS`).【F:src/modules/notifications/service.ts†L37-L137】【F:src/modules/notifications/service.ts†L195-L240】

### WhatsApp
- Integração com o Twilio. Cada número informado gera uma mensagem individual, respeitando o limite configurável por segundo (`NOTIFICATIONS_WHATSAPP_RATE_LIMIT_PER_SECOND`). IDs (`sid`) e status retornados pelo provedor são armazenados no histórico para auditoria.【F:src/modules/notifications/adapters/whatsapp-adapter.ts†L1-L170】
- O número remetente (`NOTIFICATIONS_WHATSAPP_FROM`) e a lista padrão de destinos (`NOTIFICATIONS_WHATSAPP_DEFAULT_NUMBERS`) vêm do `.env`, podendo ser sobrescritos em casos específicos via payload customizado.【F:src/modules/notifications/service.ts†L41-L115】【F:src/modules/notifications/service.ts†L195-L240】

### Webhooks
- Subscrições ficam no registry em memória (`webhook-registry.ts`), com suporte a secrets individuais.【F:src/modules/notifications/webhook-registry.ts†L5-L47】
- `WebhookNotificationAdapter` monta a requisição JSON, injeta cabeçalhos `x-imm-*` com IDs de entrega e timestamp e assina o payload com HMAC SHA-256 quando há secret disponível (global ou por webhook).【F:src/modules/notifications/adapters/webhook-adapter.ts†L1-L88】
- Chaves de entrega concluída são mantidas em memória para evitar replays involuntários do mesmo evento por assinatura, mesmo em cenários com retries de rede.【F:src/modules/notifications/adapters/webhook-adapter.ts†L12-L76】

## Orquestração com filas, DLQ e idempotência

- Todos os jobs são processados pela `JobQueue`, com limites de concorrência, tentativas e backoff progressivo configuráveis por ambiente.【F:src/modules/notifications/service.ts†L74-L141】
- O serviço mantém um `processedJobKeys` por canal/target para garantir idempotência: eventos repetidos para o mesmo alvo são ignorados e contabilizados como duplicados.【F:src/modules/notifications/service.ts†L86-L141】【F:src/modules/notifications/metrics.ts†L1-L72】
- Falhas definitivas vão para a dead-letter queue (`deadLetterQueue`) com metadados do erro, permitindo inspeção e reprocessamento manual via `retryNotificationDeadLetter` (que reinsere o job e registra retry nas métricas).【F:src/modules/notifications/service.ts†L143-L210】
- Resultados recentes de cada disparo (IDs de provedor, URLs de webhook) ficam acessíveis via `getNotificationDispatchResults()` para correlação operacional rápida.【F:src/modules/notifications/service.ts†L115-L140】【F:src/modules/notifications/service.ts†L210-L240】

## Observabilidade

- `NotificationMetrics` calcula entregas, falhas, duplicados, DLQ, retries e tempo médio por canal; o snapshot pode ser exposto em dashboards/telemetria conforme necessidade.【F:src/modules/notifications/metrics.ts†L1-L72】
- Cada adapter registra logs estruturados com `channel`, IDs e contexto do evento, facilitando correlação com traces e auditoria.【F:src/modules/notifications/adapters/email-adapter.ts†L64-L86】【F:src/modules/notifications/adapters/whatsapp-adapter.ts†L64-L102】【F:src/modules/notifications/adapters/webhook-adapter.ts†L39-L88】

## Reprocessamento seguro

1. Monitorar métricas e DLQ através dos utilitários exportados pelo serviço (`getNotificationDeadLetters`, `getNotificationMetricsSnapshot`, `getNotificationDispatchResults`).
2. Validar causas raiz (ex.: indisponibilidade do provedor ou webhook retornando erro).
3. Usar `retryNotificationDeadLetter(id)` para reencaminhar jobs após correção; o job mantém o mesmo `dedupeKey`, mas como não foi marcado como processado anteriormente, o reenvio será executado normalmente.【F:src/modules/notifications/service.ts†L143-L209】
4. Caso seja necessário reenfileirar um evento entregue anteriormente (novo disparo), gere um novo ID de evento para evitar bloqueios pela proteção anti-replay.

## Configuração

Defina as variáveis abaixo (presentes em `.env.example`) para ativar integrações externas:

```bash
# E-mail (SendGrid)
NOTIFICATIONS_EMAIL_PROVIDER=sendgrid
NOTIFICATIONS_EMAIL_SENDGRID_API_KEY=SG.xxxxxx
NOTIFICATIONS_EMAIL_FROM=alerts@imm.local
NOTIFICATIONS_EMAIL_DEFAULT_RECIPIENTS=alerts@example.com

# WhatsApp (Twilio)
NOTIFICATIONS_WHATSAPP_PROVIDER=twilio
NOTIFICATIONS_WHATSAPP_TWILIO_ACCOUNT_SID=ACxxxxxxxx
NOTIFICATIONS_WHATSAPP_TWILIO_AUTH_TOKEN=your-secret
NOTIFICATIONS_WHATSAPP_FROM=whatsapp:+14155238886
NOTIFICATIONS_WHATSAPP_DEFAULT_NUMBERS=+5511999999999
NOTIFICATIONS_WHATSAPP_RATE_LIMIT_PER_SECOND=5

# Webhooks
NOTIFICATIONS_WEBHOOK_TIMEOUT_MS=5000
NOTIFICATIONS_WEBHOOK_SECRET=change-me
```

Secrets individuais podem ser definidos ao cadastrar webhooks via API (`/notifications/webhooks`). Quando ausente, o secret global (`NOTIFICATIONS_WEBHOOK_SECRET`) é usado para assinar payloads.
