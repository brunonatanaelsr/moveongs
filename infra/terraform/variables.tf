variable "project" {
  description = "Nome base do projeto utilizado nos recursos"
  type        = string
  default     = "moveongs"
}

variable "environment" {
  description = "Identificador do ambiente (dev/staging/prod)"
  type        = string
}

variable "aws_region" {
  description = "Região AWS onde os recursos serão criados"
  type        = string
}

variable "availability_zones" {
  description = "Zonas de disponibilidade para subnets"
  type        = list(string)
}

variable "vpc_cidr" {
  description = "CIDR principal da VPC"
  type        = string
  default     = "10.20.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDRs das subnets públicas"
  type        = list(string)
}

variable "private_subnet_cidrs" {
  description = "CIDRs das subnets privadas"
  type        = list(string)
}

variable "container_image" {
  description = "Imagem do container (ex.: ghcr.io/org/moveongs:tag)"
  type        = string
}

variable "container_port" {
  description = "Porta exposta pelo container"
  type        = number
  default     = 3333
}

variable "desired_count" {
  description = "Quantidade desejada de tasks Fargate"
  type        = number
  default     = 2
}

variable "max_count" {
  description = "Máximo de tasks Fargate (auto scaling)"
  type        = number
  default     = 4
}

variable "cpu" {
  description = "CPU da task (em unidades ECS)"
  type        = number
  default     = 512
}

variable "memory" {
  description = "Memória da task (MB)"
  type        = number
  default     = 1024
}

variable "create_rds" {
  description = "Se true, provisiona banco RDS PostgreSQL"
  type        = bool
  default     = true
}

variable "rds_instance_class" {
  description = "Classe da instância RDS"
  type        = string
  default     = "db.t4g.medium"
}

variable "rds_allocated_storage" {
  description = "Armazenamento (GB) do RDS"
  type        = number
  default     = 40
}

variable "rds_multi_az" {
  description = "Habilita Multi-AZ"
  type        = bool
  default     = false
}

variable "rds_username" {
  description = "Usuário master do banco"
  type        = string
  default     = "imm"
}

variable "rds_password" {
  description = "Senha master do banco"
  type        = string
  sensitive   = true
}

variable "create_redis" {
  description = "Se true, provisiona cluster Redis (ElastiCache)"
  type        = bool
  default     = true
}

variable "redis_node_type" {
  description = "Tipo das instâncias Redis"
  type        = string
  default     = "cache.t3.small"
}

variable "redis_num_cache_nodes" {
  description = "Quantidade de nós no cluster Redis"
  type        = number
  default     = 2
}

variable "domain_name" {
  description = "Domínio público para o ALB"
  type        = string
  default     = null
}

variable "acm_certificate_arn" {
  description = "ARN do certificado ACM para HTTPS"
  type        = string
  default     = null
}

variable "route53_zone_name" {
  description = "Zona hospedada do Route53 onde o registro será criado"
  type        = string
  default     = null
}

variable "allowed_ingress_cidrs" {
  description = "Lista de CIDRs permitidos no ALB"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "extra_environment" {
  description = "Variáveis de ambiente adicionais para a task"
  type        = map(string)
  default     = {}
}

variable "jwt_secret_value" {
  description = "JWT secret a ser armazenado no Secrets Manager"
  type        = string
  sensitive   = true
}

variable "tags" {
  description = "Tags adicionais"
  type        = map(string)
  default     = {}
}
