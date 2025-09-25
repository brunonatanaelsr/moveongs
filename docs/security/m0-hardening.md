# Fase M0 — Fundamentos & Segurança

Este guia consolida as evidências de que os entregáveis críticos da fase **M0** foram concluídos e validados em staging. Ele cobre gestão de segredos via KMS/Vault, criptografia em repouso, mascaramento de dados, armazenamento seguro de anexos e a validação das pipelines de CI/CD e observabilidade.

## 1. Gestão de segredos (KMS + Vault)

* Terraform cria a chave dedicada `aws_kms_key.app` com rotação automática (`enable_key_rotation = true`) e alias `alias/<projeto>-app`, permitindo envelope encryption para Secrets Manager e S3.
* Todos os secrets (`JWT`, `DATABASE_URL`, `REDIS_URL`) usam `kms_key_id` explícito e são acessados pelas tasks via políticas minimizadas (`aws_iam_role_policy.execution_secrets`).
* A aplicação pode consumir segredos externos através do arquivo apontado por `SECRET_VAULT_PATH`, possibilitando integração com Hashicorp Vault (renderizando um `.env`/JSON injetado no container).
* Rotação: executar `aws kms rotate-key --key-id <alias>` e renovar versões no Secrets Manager. As tasks ECS utilizam cache curto (`PII_ENCRYPTION_CACHE_TTL_SECONDS`) e o deploy rolling do `deploy.yml` garante zero downtime.

## 2. Criptografia em repouso para PII/PHI

* Campos sensíveis são cifrados com `pgcrypto` em `encryptPIIValues`/`decryptPIIValues`, usando chaves efêmeras obtidas via `PII_ENCRYPTION_KMS_KEY_ID` (GenerateDataKey → AES256) e cache com TTL configurável.
* Banco de dados RDS é provisionado com `storage_encrypted = true` e Multi-AZ opcional, garantindo criptografia nativa de volume.
* Retenção/anônimização segue `src/shared/security/retention.ts`, respeitando `DATA_RETENTION_*` e limpando anexos órfãos cifrados.

## 3. Mascaramento de dados em APIs e logs

* Hook `onSend` (`src/app.ts`) aplica `maskSensitiveData` antes de serializar respostas JSON, cobrindo CPF, RG, tokens, contatos e chaves (`SENSITIVE_KEYS`).
* Logs estruturados (`src/config/logger.ts`) incluem `maskSensitiveData` indiretamente ao reaproveitar payloads já mascarados e propagam `correlation_id`, `trace_id` e `span_id` para auditoria.
* Sanitização pré-validação (`sanitizeInput`) remove payloads suspeitos, prevenindo logging acidental de conteúdo bruto.

## 4. Storage seguro de anexos

* Terraform provisiona bucket `*-attachments` com:
  - Versionamento habilitado e bloqueio total de acesso público (`aws_s3_bucket_public_access_block`).
  - Política que nega uploads sem TLS ou sem `aws:kms`.
  - Criptografia server-side KMS (`aws_s3_bucket_server_side_encryption_configuration`) reutilizando a mesma chave de segredos.
* A aplicação envia arquivos via SDK (`saveFile`) com `ServerSideEncryption` e utiliza IAM dedicado (`aws_iam_role.ecs_task`) com escopo mínimo (`s3:GetObject`, `PutObject`, `DeleteObject`).
* Variáveis `ATTACHMENTS_STORAGE=s3`, `S3_BUCKET`, `S3_SERVER_SIDE_ENCRYPTION` são injetadas automaticamente no ECS e documentadas em `.env.example`.

## 5. Pipelines CI/CD e observabilidade validadas

* Workflow [`ci.yml`](../../.github/workflows/ci.yml) roda lint (`npm run check`), testes (`npm test`) e build, sendo gatilhado em PR e main. O status "required" foi validado com execução verde após provisionar staging.
* [`deploy.yml`](../../.github/workflows/deploy.yml) realiza build + push para o GHCR e faz o rollout remoto (staging/prod) via Docker Compose. Após a etapa `Deploy to staging`, o job publica a URL (`environment.url`) usada para smoke manual (ver checklist abaixo).
* Observabilidade:
  - `deploy/docker-compose.staging.yml` liga Collector + Prometheus + Grafana + Jaeger. Após deploy, foram verificados dashboards básicos (latência, 5xx) e traces no Jaeger (`/sessions`, `/beneficiaries`).
  - Alerta de 5xx (`docs/observability/alertas.md`) foi disparado via injeção de erro controlado (`/health?fail=true`) e recuperado com runbook correspondente.

## 6. Checklist de validação em staging

1. `terraform apply -var-file=environments/staging/terraform.tfvars` (KMS, Secrets, bucket criados).
2. `npm run build && npm test` no CI (ver workflow `ci.yml`).
3. Deploy automático via `deploy.yml` → monitorar job `staging` até conclusão.
4. Executar um smoke manual (ex.: `curl -fsSL https://api.staging.example/health` e `curl -I https://api.staging.example/metrics`) autenticando uma rota protegida com token gerado via `/sessions`.
5. Validar métricas em Grafana (`Service Overview`) e traces Jaeger para requests de teste.
6. Auditoria dos secrets (`aws secretsmanager list-secrets --filters Key=name,Values=<env>`) confirma ausência de valores planos em `.env`.

> Resultado: staging opera com segredos cifrados, anexos protegidos, criptografia ponta-a-ponta para PII/PHI e observabilidade básica monitorando as releases da fase M0.
