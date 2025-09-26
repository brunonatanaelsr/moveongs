# IMM Artifacts v0.1

Este diretório reúne os artefatos base entregues para o Sistema de Gestao de Beneficiarias do Instituto Move Marias.

## Conteudo

- `sql/0001_initial.sql`: migracao inicial completa do banco Postgres (inclui extensoes, chaves estrangeiras, indices e tabelas descritas na especificacao v0.1).
- `sql/0007_attachment_antivirus.sql`: ajuste incremental adicionando metadados de varredura antivírus aos anexos.
- `json_schemas/`: colecao de JSON Schemas (Draft 2020-12) para os formularios oficiais do IMM. Use-os no motor schema-driven para renderizacao, validacao e versionamento dos formularios.

## Uso rapido

1. Habilite a extensao `pgcrypto` no banco (o script ja inclui `create extension if not exists pgcrypto`).
2. Execute a migracao inicial:
   ```sql
   \i artifacts/sql/0001_initial.sql
   ```
3. Carregue os schemas na tabela `form_templates` (ou equivalente) e vincule cada submissao em `form_submissions` registrando `form_type` e `schema_version`.
4. Armazene assinaturas como data URL, hash de arquivo ou referencia ao PDF final; os campos correspondentes sao strings flexiveis.

## Proximos passos sugeridos

- Criar seeds de usuarios, projetos, turmas e beneficiarias para ambiente de desenvolvimento.
- Publicar a especificacao OpenAPI da API IMM (v0.1) baseada neste modelo de dados.
- Integrar o motor de formulários com geracao de PDF padronizada (capa IMM, campos chaves).
