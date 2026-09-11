# ALB 모듈 (make.md §5 - 로드밸런싱, baseline #7 WebSocket)
variable "env" { type = string }
variable "vpc_id" { type = string }
variable "public_subnet_ids" { type = list(string) }
variable "alb_sg_id" { type = string }
variable "container_port" {
  type    = number
  default = 4000
}

resource "aws_lb" "this" {
  name               = "ticket-alb-${var.env}"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.alb_sg_id]
  subnets            = var.public_subnet_ids
  # WebSocket 장시간 연결 유지 (baseline #7)
  idle_timeout = 300

  tags = { Environment = var.env }
}

resource "aws_lb_target_group" "backend" {
  name        = "ticket-tg-${var.env}"
  port        = var.container_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip" # Fargate awsvpc

  health_check {
    path                = "/health"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200"
  }

  # WebSocket 세션 고정 (동일 백엔드로 연결 유지)
  stickiness {
    type            = "lb_cookie"
    cookie_duration = 300
    enabled         = true
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }
}

output "dns_name" { value = aws_lb.this.dns_name }
output "target_group_arn" { value = aws_lb_target_group.backend.arn }
