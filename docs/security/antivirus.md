# Serviço de Antivírus para Anexos

Este runbook descreve como provisionar e operar o serviço de verificação de malware utilizado pelo backend. Todas as cargas de anexo passam por uma varredura ClamAV antes de serem persistidas. A API estabelece conexão direta via TCP com o daemon `clamd` (porta 3310) e envia os arquivos com o comando [`INSTREAM`](https://docs.clamav.net/manual/Usage/Scanning.html#instream).

## Provisionamento do serviço

1. **Infraestrutura**
   - Disponibilize um daemon `clamd` acessível na rede interna (porta TCP 3310).
   - Um exemplo com Docker Compose:
     ```yaml
     services:
       clamav:
         image: clamav/clamav:latest
         ports:
           - "3310:3310"
         healthcheck:
           test: ["CMD", "bash", "-c", "printf 'PING\n' | nc 127.0.0.1 3310 | grep PONG"]
           interval: 30s
           timeout: 10s
           retries: 5
     ```
   - Garanta que `freshclam` esteja habilitado para manter as definições atualizadas.
2. **Variáveis de ambiente**
   - Defina as seguintes chaves no ECS/Compose ou `.env`:

     | Variável                | Descrição                                                          | Default      |
     | ----------------------- | ------------------------------------------------------------------ | ------------ |
     | `ANTIVIRUS_ENABLED`     | Ativa/desativa a integração com o `clamd`.                         | `true`       |
     | `ANTIVIRUS_HOST`        | Hostname ou IP do serviço `clamd`.                                 | `localhost`  |
     | `ANTIVIRUS_PORT`        | Porta TCP usada para o comando `INSTREAM`.                         | `3310`       |
     | `ANTIVIRUS_TIMEOUT_MS`  | Tempo limite (ms) para conectar e transmitir o arquivo ao daemon.  | `30000`      |
3. **Saúde**
   - Configure monitoramento que execute `printf 'PING\n' | nc $HOST $PORT` e espere `PONG`.
   - Teste fim a fim com `clamdscan --stream /tmp/eicar.com` a partir do mesmo host da API e valide a resposta `FOUND`.

## Fluxo de varredura

1. O endpoint `/files` valida tamanho/MIME e calcula `checksum` SHA-256.
2. Antes de salvar o arquivo, abre um socket TCP para o `clamd` e envia o conteúdo com `INSTREAM`.
3. Respostas possíveis do daemon:
   - `stream: OK`: upload concluído. Metadados `scanStatus=clean`, `scanSignature` e `scanCompletedAt` são persistidos e expostos em `GET /attachments`.
   - `stream: <signature> FOUND`: upload rejeitado com HTTP 422. Nenhum dado é gravado.
   - `stream: ERROR` ou timeout: erro de comunicação/processamento. Por padrão o upload é bloqueado (503) para falha segura.
   - Integração desabilitada (`ANTIVIRUS_ENABLED=false`): o upload segue, porém os campos de auditoria são preenchidos com `skipped`.
4. Os metadados são usados em auditoria (consumidos por DSR e relatórios) para rastrear varreduras.

## Operação e tratamento de falsos positivos

- **Análises pendentes**: investigue logs e conectividade TCP com o `clamd` (`nc -vz host 3310`). Restaure o serviço antes de liberar novos uploads.
- **Falsos positivos**: registre o incidente, atualize assinaturas ClamAV (`freshclam`) e repita a varredura com `clamdscan --stream`. Somente após resultado `OK` reabra o upload para o usuário.
- **Falhas do serviço**: monitore logs do backend (`antivirus scan request failed`) e acione o time de infra. Documente períodos em que `ANTIVIRUS_ENABLED` precise ser temporariamente desativado.
- **Auditoria**: utilize `attachments.antivirus_*` para comprovar horário, engine e assinatura da varredura em auditorias LGPD.

## Troubleshooting rápido

| Sintoma | Ação sugerida |
| --- | --- |
| Upload retorna 503 | Verifique conectividade TCP, se o `clamd` responde `PONG` e o timeout configurado. |
| Upload marcado como `pending` indefinidamente | Reenvie o arquivo manualmente com `clamdscan --stream` e valide se o daemon responde. |
| Falha de parse no log `failed to parse antivirus response` | Garanta que o `clamd` retorne as linhas padrão `stream: OK/FOUND/ERROR`. |
| Usuário reporta falso positivo | Atualize assinaturas (`freshclam`), execute nova varredura manual e comunique auditoria. |
