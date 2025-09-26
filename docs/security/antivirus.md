# Serviço de Antivírus para Anexos

Este runbook descreve como provisionar e operar o serviço de verificação de malware utilizado pelo backend. Todas as cargas de anexo passam por uma varredura ClamAV (ou compatível) antes de serem persistidas.

## Provisionamento do serviço

1. **Infraestrutura**
   - Disponibilize um serviço HTTP com ClamAV exposto (ex.: `clamav-rest` ou `clamdscan` encapsulado em API).
   - Garanta acesso interno seguro (VPC/VNet) entre a task ECS e o serviço.
   - Configure autenticação via API key quando disponível.
2. **Variáveis de ambiente**
   - Defina as seguintes chaves no ECS/Compose ou `.env`:
     - `ANTIVIRUS_HOST`: hostname ou IP do serviço.
     - `ANTIVIRUS_PORT`: porta HTTP/HTTPS (padrão `3310`).
     - `ANTIVIRUS_TLS`: `true` para HTTPS, `false` para HTTP.
     - `ANTIVIRUS_PATH`: rota que recebe `POST` com o arquivo (padrão `/scan`).
     - `ANTIVIRUS_API_KEY`: chave compartilhada (opcional).
     - `ANTIVIRUS_TIMEOUT_MS`: tempo limite da requisição (padrão `10000`).
     - `ANTIVIRUS_ALLOW_ON_ERROR`: defina `true` apenas se uploads devam ser aceitos quando o serviço estiver indisponível (padrão `false`, bloqueando o envio para falha segura).
3. **Saúde**
   - Execute um teste com `curl` enviando um arquivo de controle (`clam.eicar`) e valide o retorno `infected` (HTTP 200).
   - Configure monitoramento da latência/erros do endpoint.

## Fluxo de varredura

1. O endpoint `/files` valida tamanho/MIME e calcula `checksum` SHA-256.
2. Antes de salvar o arquivo, envia o payload codificado em base64 ao serviço de antivírus.
3. Respostas possíveis:
   - `clean`: upload concluído. Metadados `scanStatus=clean`, `scanSignature` e `scanCompletedAt` são persistidos e expostos em `GET /attachments`.
   - `pending`: serviço asincrônico. O status é registrado como `pending` e exibido ao usuário até a retentativa manual.
   - `infected`: upload rejeitado com HTTP 422. Nenhum dado é gravado.
   - `failed`: erro de comunicação/processamento. Por padrão o upload é bloqueado (503) — pode ser flexibilizado com `ANTIVIRUS_ALLOW_ON_ERROR=true`.
   - `skipped`: scanner desabilitado. O timestamp de auditoria é registrado mesmo sem análise.
4. Os metadados são usados em auditoria (consumidos por DSR e relatórios) para rastrear varreduras.

## Operação e tratamento de falsos positivos

- **Análises pendentes**: investigue a fila do serviço e reenvie manualmente se necessário. Atualize o registro pela API do scanner para concluir (`scanStatus=clean`).
- **Falsos positivos**: registre o incidente, atualize assinaturas ClamAV e repita a varredura. Somente após resultado `clean` reabra o upload para o usuário.
- **Falhas do serviço**: monitore logs do backend (`antivirus scan request failed`) e acione o time de infra. Caso seja imprescindível manter uploads, altere temporariamente `ANTIVIRUS_ALLOW_ON_ERROR=true`, documentando o período de exceção.
- **Auditoria**: utilize `attachments.scan_*` para comprovar horário, engine e assinatura da varredura em auditorias LGPD.

## Troubleshooting rápido

| Sintoma | Ação sugerida |
| --- | --- |
| Upload retorna 503 | Verifique conectividade com o serviço, status HTTP, e se o timeout está adequado. |
| Upload marcado como `pending` indefinidamente | Verifique filas internas do serviço de antivírus e reexecute a varredura. |
| Falha de parse no log `failed to parse antivirus response` | Ajuste o formato da API para retornar JSON válido com campo `status`. |
| Usuário reporta falso positivo | Atualize assinaturas, execute `freshclam`, force nova varredura e comunique auditoria. |
