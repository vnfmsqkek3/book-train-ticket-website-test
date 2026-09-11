# 프론트엔드 정적 호스팅: S3 + CloudFront (사용자 지시)
# - S3: Next static export 산출물 (비공개, OAC로만 접근)
# - CloudFront: 기본 오리진 S3, /api/* + /health 등은 ALB 오리진으로 라우팅
variable "env" { type = string }
variable "alb_dns_name" { type = string }
variable "account_id" { type = string }

locals {
  s3_origin_id  = "s3-frontend"
  alb_origin_id = "alb-backend"
}

# ── S3 버킷 (정적 산출물) ──
resource "aws_s3_bucket" "frontend" {
  bucket        = "ticket-frontend-${var.env}-${var.account_id}"
  force_destroy = true
  tags          = { Name = "ticket-frontend-${var.env}" }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── CloudFront Origin Access Control (S3 비공개 접근) ──
resource "aws_cloudfront_origin_access_control" "s3" {
  name                              = "ticket-oac-${var.env}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ── CloudFront 배포 ──
resource "aws_cloudfront_distribution" "this" {
  enabled             = true
  default_root_object = "index.html"
  comment             = "ticket frontend ${var.env}"
  price_class         = "PriceClass_200"

  # S3 오리진 (프론트 정적)
  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = local.s3_origin_id
    origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
  }

  # ALB 오리진 (백엔드 API, HTTP only)
  origin {
    domain_name = var.alb_dns_name
    origin_id   = local.alb_origin_id
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # 기본 동작: S3 (프론트)
  default_cache_behavior {
    target_origin_id       = local.s3_origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }
    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
  }

  # /api/* → ALB (캐시 없음, 모든 메서드, WebSocket 포함)
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = local.alb_origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    forwarded_values {
      query_string = true
      headers      = ["*"] # WebSocket 업그레이드 헤더 포함 전달
      cookies { forward = "all" }
    }
    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0
  }

  # /health → ALB (모니터링/디버그용)
  ordered_cache_behavior {
    path_pattern           = "/health"
    target_origin_id       = local.alb_origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }
    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0
  }

  # SPA 라우팅: 정적 export는 실제 파일 존재. 404는 index로 폴백하지 않고 그대로 노출
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = { Name = "ticket-cloudfront-${var.env}" }
}

# ── S3 버킷 정책: CloudFront OAC만 읽기 허용 ──
resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontOAC"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.frontend.arn}/*"
      Condition = {
        StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.this.arn }
      }
    }]
  })
}

output "bucket_name" { value = aws_s3_bucket.frontend.bucket }
output "distribution_id" { value = aws_cloudfront_distribution.this.id }
output "cloudfront_domain" { value = aws_cloudfront_distribution.this.domain_name }
