# ECR 리포지토리 모듈 (CodeBuild가 백엔드 이미지 push)
variable "env" { type = string }

resource "aws_ecr_repository" "backend" {
  name                 = "ticket-booking-backend-${var.env}"
  image_tag_mutability = "MUTABLE"
  force_delete         = true # dev: destroy 시 이미지 함께 삭제
  image_scanning_configuration {
    scan_on_push = true
  }
  tags = { Name = "ticket-ecr-backend-${var.env}" }
}

# 오래된 이미지 정리 (최근 10개 유지)
resource "aws_ecr_lifecycle_policy" "backend" {
  repository = aws_ecr_repository.backend.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "최근 10개 이미지만 유지"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

output "repository_url" { value = aws_ecr_repository.backend.repository_url }
output "repository_name" { value = aws_ecr_repository.backend.name }
output "repository_arn" { value = aws_ecr_repository.backend.arn }
