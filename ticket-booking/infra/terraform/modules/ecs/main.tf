# ECS 클러스터 모듈 (make.md §5 AWS 리소스 - ECS/Fargate 백엔드)
variable "env" { type = string }
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "alb_target_group_arn" { type = string }
variable "backend_image" { type = string }
variable "backend_sg_id" { type = string }
variable "container_port" {
  type    = number
  default = 4000
}
variable "desired_count" {
  type    = number
  default = 2
}
variable "cpu" {
  type    = number
  default = 512
}
variable "memory" {
  type    = number
  default = 1024
}
variable "environment" {
  type    = map(string)
  default = {}
}
# Secrets Manager: DB 비밀번호 등 민감정보 ARN (key = 컨테이너 env 이름, value = secret ARN[:json-key])
variable "secrets" {
  type    = map(string)
  default = {}
}
# DB 비밀번호 secret ARN (task execution role IAM 권한 부여용)
variable "secret_arns" {
  type    = list(string)
  default = []
}

resource "aws_ecs_cluster" "this" {
  name = "ticket-booking-${var.env}"
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
  tags = { Name = "ticket-ecs-cluster-${var.env}" }
}

resource "aws_iam_role" "task_execution" {
  name = "ticket-ecs-exec-${var.env}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
  tags = { Name = "ticket-ecs-exec-role-${var.env}" }
}

resource "aws_iam_role_policy_attachment" "exec" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Secrets Manager 읽기 권한 (task execution role이 컨테이너 기동 시 secret 주입)
resource "aws_iam_role_policy" "secrets" {
  count = length(var.secret_arns) > 0 ? 1 : 0
  name  = "ticket-ecs-secrets-${var.env}"
  role  = aws_iam_role.task_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = var.secret_arns
    }]
  })
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/ticket-booking-${var.env}"
  retention_in_days = 14
  tags              = { Name = "ticket-logs-${var.env}" }
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "ticket-backend-${var.env}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.task_execution.arn

  container_definitions = jsonencode([{
    name      = "backend"
    image     = var.backend_image
    essential = true
    portMappings = [{
      containerPort = var.container_port
      protocol      = "tcp"
    }]
    environment = [for k, v in var.environment : { name = k, value = v }]
    secrets     = [for k, v in var.secrets : { name = k, valueFrom = v }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.backend.name
        "awslogs-region"        = data.aws_region.current.name
        "awslogs-stream-prefix" = "backend"
      }
    }
    healthCheck = {
      command     = ["CMD-SHELL", "wget -q -O - http://localhost:${var.container_port}/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
  }])

  tags = { Name = "ticket-backend-taskdef-${var.env}" }
}

data "aws_region" "current" {}

resource "aws_ecs_service" "backend" {
  name            = "ticket-backend-${var.env}"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = var.private_subnet_ids
    security_groups = [var.backend_sg_id]
  }

  load_balancer {
    target_group_arn = var.alb_target_group_arn
    container_name   = "backend"
    container_port   = var.container_port
  }

  tags = { Name = "ticket-backend-service-${var.env}" }

  # CodePipeline이 배포 시 task_definition/desired_count를 갱신하므로 무시
  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }
}

# 오토스케일링 (make.md §5 DLT 1000 동시 사용자 대응)
resource "aws_appautoscaling_target" "ecs" {
  max_capacity       = 10
  min_capacity       = var.desired_count
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.backend.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "cpu-scale-${var.env}"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = 60.0
  }
}

output "cluster_name" { value = aws_ecs_cluster.this.name }
output "service_name" { value = aws_ecs_service.backend.name }
output "task_family" { value = aws_ecs_task_definition.backend.family }
output "container_name" { value = "backend" }
output "log_group" { value = aws_cloudwatch_log_group.backend.name }
