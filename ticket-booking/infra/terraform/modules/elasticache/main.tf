# ElastiCache(Redis) 모듈 (make.md §5 - 좌석 잠금/대기열)
variable "env" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "redis_sg_id" { type = string }
variable "node_type" {
  type    = string
  default = "cache.t3.micro" # 개발 단계 (make.md §5)
}

resource "aws_elasticache_subnet_group" "this" {
  name       = "ticket-redis-${var.env}"
  subnet_ids = var.private_subnet_ids
}

resource "aws_elasticache_replication_group" "this" {
  replication_group_id = "ticket-redis-${var.env}"
  description          = "Ticket booking queue & seat lock (${var.env})"
  engine               = "redis"
  engine_version       = "7.0"
  node_type            = var.node_type
  # prod는 복제본으로 고가용성, dev/staging은 단일 노드 (환경 분리)
  num_cache_clusters         = var.env == "prod" ? 2 : 1
  automatic_failover_enabled = var.env == "prod"
  subnet_group_name          = aws_elasticache_subnet_group.this.name
  security_group_ids         = [var.redis_sg_id]
  port                       = 6379
  # 대기열 상태 영속성 (make.md §2 큐 상태 복구 - AOF/RDB)
  snapshot_retention_limit = var.env == "prod" ? 5 : 1

  tags = { Environment = var.env }
}

output "endpoint" { value = aws_elasticache_replication_group.this.primary_endpoint_address }
output "port" { value = 6379 }
