# Terraform — MoveONgs Infrastructure

Este diretório contém a infraestrutura como código para provisionar os ambientes **dev**, **staging** e **produção** na AWS utilizando ECS Fargate, RDS PostgreSQL, Redis/ElastiCache e Application Load Balancer. A stack segue boas práticas de isolamento por ambiente e tags padronizadas.

## Estrutura

```
infra/terraform/
├── main.tf               # Definição principal dos recursos compartilhados
├── variables.tf          # Variáveis de entrada
├── outputs.tf            # Outputs úteis (endpoints, ARNs)
├── environments/
│   ├── dev/terraform.tfvars
│   ├── staging/terraform.tfvars
│   └── prod/terraform.tfvars
└── README.md
```

## Pré-requisitos

* Terraform >= 1.6.0
* Conta AWS com credenciais e permissões para ECS, RDS, ElastiCache, VPC, ALB, CloudWatch, Secrets Manager.
* Bucket S3 e tabela DynamoDB para state remoto (configure em `backend` se desejar).

## Uso

1. Ajuste os arquivos `terraform.tfvars` em cada ambiente com os valores adequados (domínio, tamanhos, VPC CIDR, etc.).
2. Inicialize o Terraform:

   ```bash
   cd infra/terraform
   terraform init
   ```

3. Selecione o workspace correspondente (ex.: `terraform workspace new staging`).
4. Aplique o plano:

   ```bash
   terraform apply -var-file=environments/staging/terraform.tfvars
   ```

## Recursos provisionados

* **Rede:** VPC com subnets públicas/privadas, NAT Gateway e security groups separados.
* **Compute:** ECS Fargate Cluster + Service `api` com Auto Scaling opcional.
* **Banco de dados:** RDS PostgreSQL Multi-AZ opcional.
* **Cache:** ElastiCache Redis (cluster replicado) para uso em produção/staging.
* **Observabilidade:** CloudWatch Log Group e parâmetros SSM para secrets.
* **Networking:** Application Load Balancer com HTTPS (ACM) e integração com Route53.

Os outputs expõem URLs do ALB, strings de conexão e nomes de recursos para integração com CI/CD.

## Notas

* Para ambientes que usam bancos gerenciados externos, basta desabilitar os blocos correspondentes nas variáveis (`create_rds = false`).
* Secrets sensíveis (JWT, senhas) são armazenados no AWS Secrets Manager e injetados na task definition.
* Consulte os arquivos `terraform.tfvars` para exemplos de dimensionamento (vCPU/memória, tamanhos de instâncias, etc.).
