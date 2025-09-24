# OpenAPI reference

Este diretório contém a documentação versionada da API pública do MoveONgs. Cada versão é descrita em um arquivo OpenAPI independente (formato YAML) e deve ser atualizada sempre que endpoints, contratos ou requisitos de autenticação forem alterados.

## Estrutura

```
docs/openapi/
├── README.md
└── v1/
    └── openapi.yaml
```

* **v1/** – primeira versão estável da API consumida pelos produtos MoveONgs.

## Como atualizar

1. Ao alterar contratos HTTP, atualize os esquemas e descrições no arquivo da versão vigente (`v1/openapi.yaml`).
2. Quando houver breaking changes, crie um novo diretório (`v2/`) copiando a versão anterior e aplique as mudanças, mantendo o histórico para clientes legados.
3. Valide o arquivo com uma ferramenta de lint (ex.: `npx @redocly/cli lint docs/openapi/v1/openapi.yaml`).
4. Publique o artefato no pipeline de CI (ver tarefa em `docs/backlog-codex.md`).

## Uso

* **Backend/Frontend**: consumir o arquivo para gerar SDKs ou validar chamadas.
* **Governança**: referenciar este documento em auditorias de conformidade e handbooks de onboarding.

> Dica: use o VS Code ou Redocly para visualizar a especificação com melhor ergonomia.
