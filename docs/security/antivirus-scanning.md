# Escaneamento Antivírus de Anexos

Este runbook descreve como operar o serviço de antivírus integrado ao módulo de anexos. Todo arquivo enviado passa por uma varredura ClamAV antes de ser persistido no storage. Resultados, assinaturas e mensagens do scanner são registrados no banco e expostos na API para auditoria.

## Provisionamento do serviço

1. Suba um serviço compatível com ClamAV exposto via HTTP (por exemplo [`clamav-rest`](https://github.com/solita/clamav-rest) ou a imagem `mkodockx/docker-clamav:alpine`).
2. Publique o endpoint `/scan` aceitando `POST` com o corpo binário do arquivo e respondendo JSON no formato:
   ```json
   {
     "status": "clean" | "infected" | "error",
     "signature": "Win.Test.EICAR",
     "message": "EICAR test file detected"
   }
   ```
   > Qualquer payload desconhecido é tratado como falha e registrado com status `error`.
3. Configure as variáveis de ambiente na API:

   | Variável                 | Descrição                                                      | Default    |
   | ----------------------- | -------------------------------------------------------------- | ---------- |
   | `ANTIVIRUS_HOST`        | Hostname ou IP onde o serviço está exposto.                    | `localhost` |
   | `ANTIVIRUS_PORT`        | Porta HTTP do serviço.                                         | `8080`      |
   | `ANTIVIRUS_PROTOCOL`    | Protocolo (`http` ou `https`).                                 | `http`      |
   | `ANTIVIRUS_SCAN_PATH`   | Caminho da rota de varredura (ex.: `/scan`).                   | `/scan`     |
   | `ANTIVIRUS_TIMEOUT_MS`  | Timeout em milissegundos para a chamada HTTP.                  | `10000`     |
   | `ANTIVIRUS_API_KEY`     | Token opcional (Bearer) caso o serviço exija autenticação.     | _vazio_     |

4. Atualize o `.env` (ou o secret manager correspondente) e redeploy a API.

## Fluxo de upload

1. O arquivo é validado quanto ao tamanho/MIME (`validateUpload`).
2. O buffer é enviado ao serviço ClamAV. Enquanto o scanner não responde, o upload fica pendente.
3. Resultado `infected` gera erro `422` e impede a gravação do arquivo.
4. Resultados `clean` ou `error` são persistidos junto ao anexo nos campos:
   - `antivirus_scan_status`
   - `antivirus_scan_signature`
   - `antivirus_scan_message`
   - `antivirus_scanned_at`
5. A API devolve o attachment com os metadados acima, permitindo ao front-end sinalizar "Em análise", "Falha no antivírus" ou "Limpo" ao usuário.

> Quando `status = error` o arquivo é armazenado, mas o operador deve avaliar o log (`antivirus_scan_message`) e decidir se reprocessa a fila.

## Monitoramento e tratamento de falhas

- **Logs**: entradas `antivirus scan request failed` (warning) e `antivirus scan threw an error` (error) indicam indisponibilidade do serviço.
- **Consultas SQL úteis**:
  ```sql
  select id, file_name, antivirus_scan_status, antivirus_scan_message
    from attachments
   where antivirus_scan_status = 'error'
   order by antivirus_scanned_at desc nulls last;
  ```
- **Falsos positivos**: se um arquivo legítimo for sinalizado como `infected`, revalide manualmente com `clamscan`. Caso confirme falso positivo, atualize as definições do ClamAV (`freshclam`) e reenvie o arquivo.
- **Reprocessamento manual**: para reapontar anexos com status `error`, execute um job em lote que leia os buffers do storage e reenvie para o serviço. Atualize os campos `antivirus_*` com o novo resultado via script administrativo.

## Considerações operacionais

- Mantenha o serviço ClamAV com atualizações automáticas (`freshclam`) e health-check exposto (por exemplo `GET /` retornando `pong`).
- Configure alertas quando houver mais de _N_ anexos com `antivirus_scan_status = 'error'` em um intervalo de 15 minutos (indicativo de indisponibilidade do scanner).
- Garanta que filas ou workers que façam pós-processamento de anexos leiam os campos de status e evitem publicar arquivos marcados como `infected`.
- Documente na central de atendimento que erros de antivírus aparecem para o usuário final como "Verificação do arquivo falhou" com detalhes adicionais recuperados de `antivirus_scan_message`.
