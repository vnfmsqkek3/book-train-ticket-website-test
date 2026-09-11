# CloudWatch 모니터링 & 알림 (make.md §5 모니터링 & 알림)
variable "env" { type = string }
variable "cluster_name" { type = string }
variable "service_name" { type = string }
variable "alb_arn_suffix" { type = string }
variable "alarm_email" {
  type    = string
  default = ""
}

resource "aws_sns_topic" "alerts" {
  name = "ticket-alerts-${var.env}"
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alarm_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

# DLT 기준: p99 < 2s → ALB TargetResponseTime 알람 (make.md DLT 검증 기준)
resource "aws_cloudwatch_metric_alarm" "latency_p99" {
  alarm_name          = "ticket-latency-p99-${var.env}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  extended_statistic  = "p99"
  threshold           = 2.0 # 2초 (make.md DLT p99 < 2s)
  dimensions          = { LoadBalancer = var.alb_arn_suffix }
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

# 평균 응답시간 < 500ms
resource "aws_cloudwatch_metric_alarm" "latency_avg" {
  alarm_name          = "ticket-latency-avg-${var.env}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Average"
  threshold           = 0.5 # 500ms (make.md DLT 평균 < 500ms)
  dimensions          = { LoadBalancer = var.alb_arn_suffix }
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "ecs_cpu" {
  alarm_name          = "ticket-ecs-cpu-${var.env}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = 80
  dimensions          = { ClusterName = var.cluster_name, ServiceName = var.service_name }
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "http_5xx" {
  alarm_name          = "ticket-5xx-${var.env}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Sum"
  threshold           = 10
  dimensions          = { LoadBalancer = var.alb_arn_suffix }
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "ticket-booking-${var.env}"
  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric", width = 12, height = 6,
        properties = {
          title  = "ALB 응답시간 (DLT 기준: avg<500ms, p99<2s)"
          region = "ap-northeast-2"
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", var.alb_arn_suffix, { stat = "Average", label = "평균" }],
            ["...", { stat = "p99", label = "p99" }]
          ]
        }
      },
      {
        type = "metric", width = 12, height = 6,
        properties = {
          title  = "처리량 RPS (DLT 기준: ≥100)"
          region = "ap-northeast-2"
          metrics = [["AWS/ApplicationELB", "RequestCount", "LoadBalancer", var.alb_arn_suffix, { stat = "Sum" }]]
        }
      },
      {
        type = "metric", width = 12, height = 6,
        properties = {
          title   = "ECS CPU/메모리"
          region  = "ap-northeast-2"
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ClusterName", var.cluster_name, "ServiceName", var.service_name],
            ["AWS/ECS", "MemoryUtilization", "ClusterName", var.cluster_name, "ServiceName", var.service_name]
          ]
        }
      }
    ]
  })
}

output "sns_topic_arn" { value = aws_sns_topic.alerts.arn }
