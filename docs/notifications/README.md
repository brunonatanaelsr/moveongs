# Notificações externas e integrações

Este módulo coordena os disparos automáticos de notificações externas quando eventos de domínio são publicados via `publishNotificationEvent`. Os disparos são executados de forma assíncrona e idempotente, com observabilidade e mecanismos de recuperação para cada canal suportado.

## Canais suportados

### E-mail
- Adapter `EmailNotificationAdapter` usa o AWS SES (`SendEmailCommand`) para entregar mensagens textuais, preservando o histórico de disparo (ID do SES, assunto, destinatários e timestamp) para auditoria rápida.【F:src/modules/notifications/adapters/email-adapter.ts†L1-L84】
- O remetente vem de `NOTIFICATIONS_EMAIL_FROM` e os destinatários podem ser informados por evento ou via configuração padrão (`NOTIFICATIONS_EMAIL_RECIPIENTS`).【F:src/modules/notifications/service.ts†L49-L105】
- Credenciais e região do SES são lidas das variáveis `NOTIFICATIONS_EMAIL_SES_REGION`, `NOTIFICATIONS_EMAIL_SES_ACCESS_KEY_ID` e `NOTIFICATIONS_EMAIL_SES_SECRET_ACCESS_KEY` (ou das credenciais padrão da AWS quando omitidas).【F:src/config/env.ts†L23-L37】【F:src/modules/notifications/service.ts†L36-L62】

### WhatsApp
- Adapter `WhatsAppNotificationAdapter` integra com o Twilio WhatsApp API, enviando mensagens para cada número do payload e registrando SIDs/status individuais no histórico para auditoria.【F:src/modules/notifications/adapters/whatsapp-adapter.ts†L1-L94】
- Os números padrão são lidos da variável `NOTIFICATIONS_WHATSAPP_NUMBERS` (lista separada por vírgula) e o remetente `from` vem de `NOTIFICATIONS_WHATSAPP_FROM` (formato `whatsapp:+<código>`).【F:src/modules/notifications/service.ts†L64-L90】
- O client Twilio é configurado via `NOTIFICATIONS_WHATSAPP_TWILIO_ACCOUNT_SID` e `NOTIFICATIONS_WHATSAPP_TWILIO_AUTH_TOKEN`.【F:src/config/env.ts†L23-L39】【F:src/modules/notifications/service.ts†L36-L62】

### Webhooks
- Subscrições ficam no registry em memória (`webhook-registry.ts`), com suporte a secrets individuais.【F:src/modules/notifications/webhook-registry.ts†L5-L47】
- `WebhookNotificationAdapter` monta a requisição JSON, injeta cabeçalhos `x-imm-*` com IDs de entrega e timestamp e assina o payload com HMAC SHA-256 quando há secret disponível (global ou por webhook).【F:src/modules/notifications/adapters/webhook-adapter.ts†L1-L72】
- Chaves de entrega concluída são mantidas em memória para evitar replays involuntários do mesmo evento por assinatura, mesmo em cenários com retries de rede.【F:src/modules/notifications/adapters/webhook-adapter.ts†L15-L38】

## Orquestração com filas, DLQ e idempotência

- Todos os jobs são processados pela `JobQueue`, com limites de concorrência, tentativas e backoff progressivo configuráveis por ambiente.【F:src/modules/notifications/service.ts†L64-L116】
- O serviço mantém um `processedJobKeys` por canal/target para garantir idempotência: eventos repetidos para o mesmo alvo são ignorados e contabilizados como duplicados.【F:src/modules/notifications/service.ts†L58-L108】【F:src/modules/notifications/metrics.ts†L35-L63】
- Falhas definitivas vão para a dead-letter queue (`deadLetterQueue`) com metadados do erro, permitindo inspeção e reprocessamento manual via `retryNotificationDeadLetter` (que reinsere o job e registra retry nas métricas).【F:src/modules/notifications/service.ts†L118-L173】

## Observabilidade

- `NotificationMetrics` calcula entregas, falhas, duplicados, DLQ, retries e tempo médio por canal; o snapshot pode ser exposto em dashboards/telemetria conforme necessidade.【F:src/modules/notifications/metrics.ts†L1-L72】
- Cada adapter registra logs estruturados com `channel`, IDs e contexto do evento, facilitando correlação com traces e auditoria.【F:src/modules/notifications/adapters/email-adapter.ts†L28-L36】【F:src/modules/notifications/adapters/whatsapp-adapter.ts†L27-L35】【F:src/modules/notifications/adapters/webhook-adapter.ts†L39-L72】

## Reprocessamento seguro

1. Monitorar métricas e DLQ através dos utilitários exportados pelo serviço (`getNotificationDeadLetters`, `getNotificationMetricsSnapshot`).
2. Validar causas raiz (ex.: indisponibilidade do provedor ou webhook retornando erro).
3. Usar `retryNotificationDeadLetter(id)` para reencaminhar jobs após correção; o job mantém o mesmo `dedupeKey`, mas como não foi marcado como processado anteriormente, o reenvio será executado normalmente.【F:src/modules/notifications/service.ts†L129-L168】
4. Caso seja necessário reenfileirar um evento entregue anteriormente (novo disparo), gere um novo ID de evento para evitar bloqueios pela proteção anti-replay.

## Configuração

Defina as variáveis abaixo (presentes em `.env.example`) para ativar integrações externas:

```bash
NOTIFICATIONS_EMAIL_FROM=alerts@imm.local
NOTIFICATIONS_EMAIL_SES_REGION=us-east-1
NOTIFICATIONS_EMAIL_SES_ACCESS_KEY_ID=aws-access-key
NOTIFICATIONS_EMAIL_SES_SECRET_ACCESS_KEY=aws-secret-key
NOTIFICATIONS_EMAIL_RECIPIENTS=alerts@example.com
NOTIFICATIONS_WHATSAPP_NUMBERS=+5511999999999
NOTIFICATIONS_WHATSAPP_FROM=whatsapp:+14155238886
NOTIFICATIONS_WHATSAPP_TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTIFICATIONS_WHATSAPP_TWILIO_AUTH_TOKEN=twilio-auth-token
NOTIFICATIONS_WEBHOOK_TIMEOUT_MS=5000
NOTIFICATIONS_WEBHOOK_SECRET=change-me
```

Secrets individuais podem ser definidos ao cadastrar webhooks via API (`/notifications/webhooks`). Quando ausente, o secret global (`NOTIFICATIONS_WEBHOOK_SECRET`) é usado para assinar payloads.
