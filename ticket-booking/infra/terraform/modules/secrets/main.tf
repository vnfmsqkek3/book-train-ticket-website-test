# Secrets Manager 모듈 - DB 비밀번호 관리 (하드코딩 금지)
variable "env" { type = string }
variable "db_username" {
  type    = string
  default = "ticket"
}

# 강력한 임의 비밀번호 생성 (RDS 호환 문자셋)
resource "random_password" "db" {
  length  = 24
  special = true
  # RDS MySQL 마스터 비밀번호에 허용되지 않는 문자 제외 (/ @ " space)
  override_special = "!#$%^&*()-_=+[]{}"
}

resource "aws_secretsmanager_secret" "db" {
  name        = "ticket/db/${var.env}/master"
  description = "Ticket booking RDS master credential (${var.env})"
  tags        = { Name = "ticket-db-secret-${var.env}" }
}

resource "aws_secretsmanager_secret_version" "db" {
  secret_id = aws_secretsmanager_secret.db.id
  secret_string = jsonencode({
    username = var.db_username
    password = random_password.db.result
  })
}

output "secret_arn" { value = aws_secretsmanager_secret.db.arn }
# ECS 컨테이너 secrets 주입용 (JSON key 지정)
output "password_secret_ref" { value = "${aws_secretsmanager_secret.db.arn}:password::" }
output "db_password" {
  value     = random_password.db.result
  sensitive = true
}
output "db_username" { value = var.db_username }
