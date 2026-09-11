# RDS(MySQL) 모듈 (make.md §5 - 좌석/대기열 DB)
variable "env" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "db_sg_id" { type = string }
variable "instance_class" {
  type    = string
  default = "db.t3.small" # 개발 단계 (make.md §5)
}
variable "db_name" {
  type    = string
  default = "ticket_booking"
}
variable "db_username" {
  type    = string
  default = "ticket"
}
variable "db_password" {
  type      = string
  sensitive = true
}

resource "aws_db_subnet_group" "this" {
  name       = "ticket-db-${var.env}"
  subnet_ids = var.private_subnet_ids
}

resource "aws_db_instance" "this" {
  identifier             = "ticket-booking-${var.env}"
  engine                 = "mysql"
  engine_version         = "8.0"
  instance_class         = var.instance_class
  allocated_storage      = 20
  max_allocated_storage  = 100
  db_name                = var.db_name
  username               = var.db_username
  password               = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [var.db_sg_id]
  # dev/staging은 단일 AZ, prod는 Multi-AZ (환경 분리)
  multi_az                = var.env == "prod"
  skip_final_snapshot     = var.env != "prod"
  backup_retention_period = var.env == "prod" ? 7 : 1
  storage_encrypted       = true
  deletion_protection     = var.env == "prod"

  tags = { Environment = var.env }
}

output "endpoint" { value = aws_db_instance.this.address }
output "port" { value = aws_db_instance.this.port }
