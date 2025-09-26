# Escaneamento Antivírus de Anexos

Este runbook descreve como operar o serviço de antivírus integrado ao módulo de anexos. Todo arquivo enviado passa por uma varredura ClamAV antes de ser persistido no storage. A API comunica-se diretamente com o daemon `clamd` via socket TCP (porta 3310) usando o comando [`INSTREAM`](https://docs.clamav.net/manual/Usage/Scanning.html#instream). Resultados, assinaturas e mensagens do scanner são registrados no banco e expostos na API para auditoria.

## Provisionamento do serviço

1. Suba um serviço com o daemon `clamd` exposto na porta 3310. Um exemplo simples usando Docker Compose:
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
2. Garanta conectividade TCP entre a API e o `clamd` (rede interna ou security group permitindo a porta 3310).
3. Configure as variáveis de ambiente na API:

   | Variável                | Descrição                                                          | Default      |
   | ----------------------- | ------------------------------------------------------------------ | ------------ |
   | `ANTIVIRUS_ENABLED`     | Define se a API deve acionar o scanner.                            | `true`       |
   | `ANTIVIRUS_HOST`        | Hostname ou IP onde o `clamd` está exposto.                        | `localhost`  |
   | `ANTIVIRUS_PORT`        | Porta TCP do `clamd` para o comando `INSTREAM`.                    | `3310`       |
   | `ANTIVIRUS_TIMEOUT_MS`  | Timeout em milissegundos para a conexão/streaming com o `clamd`.   | `30000`      |

4. Atualize o `.env` (ou o secret manager correspondente) e redeploy a API.

## Fluxo de upload

1. O arquivo é validado quanto ao tamanho/MIME (`validateUpload`).
2. O buffer é transmitido diretamente ao `clamd` usando o comando `INSTREAM` sobre TCP. Enquanto o scanner não responde, o upload fica pendente.
3. Resposta contendo assinatura (`FOUND`) gera erro `422` e impede a gravação do arquivo.
4. Resultados `OK` ou falhas na sessão (`ERROR`) são persistidos junto ao anexo nos campos:
   - `antivirus_scan_status`
   - `antivirus_scan_signature`
   - `antivirus_scan_message`
   - `antivirus_scanned_at`
5. A API devolve o attachment com os metadados acima, permitindo ao front-end sinalizar "Em análise", "Falha no antivírus" ou "Limpo" ao usuário.

> Quando o daemon retorna erro de comunicação (`ERROR`) o arquivo é armazenado, mas o operador deve avaliar o log (`antivirus_scan_message`) e decidir se reprocessa a fila.

## Monitoramento e tratamento de falhas

- **Logs**: entradas `antivirus scan request failed` (warning) e `antivirus scan threw an error` (error) indicam indisponibilidade ou falha de streaming com o `clamd`.
- **Consultas SQL úteis**:
  ```sql
  select id, file_name, antivirus_scan_status, antivirus_scan_message
    from attachments
   where antivirus_scan_status = 'error'
   order by antivirus_scanned_at desc nulls last;
  ```
- **Falsos positivos**: se um arquivo legítimo for sinalizado como infectado, revalide manualmente com `clamscan`. Caso confirme falso positivo, atualize as definições do ClamAV (`freshclam`) e reenvie o arquivo.
- **Reprocessamento manual**: para reapontar anexos com status `error`, execute um job em lote que leia os buffers do storage e reenvie via socket TCP para o `clamd`. Atualize os campos `antivirus_*` com o novo resultado via script administrativo.

## Considerações operacionais

- Mantenha o serviço ClamAV com atualizações automáticas (`freshclam`) e um health-check que envie `PING` para o `clamd`.
- Configure alertas quando houver mais de _N_ anexos com `antivirus_scan_status = 'error'` em um intervalo de 15 minutos (indicativo de indisponibilidade do scanner).
- Garanta que filas ou workers que façam pós-processamento de anexos leiam os campos de status e evitem publicar arquivos marcados como infectados.
- Documente na central de atendimento que erros de antivírus aparecem para o usuário final como "Verificação do arquivo falhou" com detalhes adicionais recuperados de `antivirus_scan_message`.

## Teste recomendado

1. Faça o deploy do `clamd` conforme o exemplo acima e aguarde o health-check ficar `healthy`.
2. Gere o arquivo de teste EICAR (`curl -o /tmp/eicar.com https://secure.eicar.org/eicar.com.txt`).
3. A partir do host da API, execute:
   ```bash
   clamdscan --stream /tmp/eicar.com
   ```
   O comando transmite o arquivo via `INSTREAM` para o `clamd`. A saída deve conter `FOUND`, confirmando a detecção e validando a conectividade TCP.
4. Faça um upload pela aplicação do arquivo EICAR e verifique se o anexo é bloqueado com status `infected`.
