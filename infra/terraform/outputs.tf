output "alb_dns_name" {
  description = "DNS público do Application Load Balancer"
  value       = aws_lb.this.dns_name
}

output "alb_listener_arn" {
  description = "ARN do listener HTTP"
  value       = aws_lb_listener.http.arn
}

output "https_listener_arn" {
  description = "ARN do listener HTTPS (se configurado)"
  value       = try(aws_lb_listener.https[0].arn, null)
}

output "ecs_cluster_name" {
  description = "Nome do cluster ECS"
  value       = aws_ecs_cluster.this.name
}

output "ecs_service_name" {
  description = "Nome do serviço ECS"
  value       = aws_ecs_service.api.name
}

output "cloudwatch_log_group" {
  description = "Log group principal"
  value       = aws_cloudwatch_log_group.api.name
}

output "rds_endpoint" {
  description = "Endpoint do banco de dados"
  value       = try(module.rds[0].db_instance_endpoint, null)
}

output "redis_endpoint" {
  description = "Endpoint do Redis"
  value       = try(module.redis[0].primary_endpoint_address, null)
}

output "jwt_secret_arn" {
  description = "ARN do secret JWT"
  value       = aws_secretsmanager_secret.jwt.arn
}

output "database_url_secret_arn" {
  description = "ARN do secret com DATABASE_URL"
  value       = try(aws_secretsmanager_secret.database_url[0].arn, null)
}

output "redis_url_secret_arn" {
  description = "ARN do secret com REDIS_URL"
  value       = try(aws_secretsmanager_secret.redis_url[0].arn, null)
}

output "kms_key_arn" {
  description = "ARN da KMS key utilizada para segredos e anexos"
  value       = aws_kms_key.app.arn
}

output "kms_alias_arn" {
  description = "Alias ARN associado à KMS key"
  value       = aws_kms_alias.app.arn
}

output "attachments_bucket_name" {
  description = "Bucket S3 com anexos cifrados"
  value       = aws_s3_bucket.attachments.bucket
}
