# CI/CD 모듈 — CodeStar Connections(GitHub) + CodeBuild + CodePipeline
# main 브랜치 push → 자동 빌드 → ECS 배포
variable "env" { type = string }
variable "github_owner" { type = string }
variable "github_repo" { type = string }
variable "github_branch" {
  type    = string
  default = "main"
}
variable "ecr_repo_url" { type = string }
variable "ecr_repo_arn" { type = string }
variable "ecs_cluster_name" { type = string }
variable "ecs_service_name" { type = string }
variable "container_name" { type = string }
variable "region" { type = string }
variable "account_id" { type = string }
variable "frontend_bucket" { type = string }
variable "frontend_distribution_id" { type = string }

# ── CodeStar Connection (GitHub) — 생성 후 콘솔에서 사용자가 승인 ──
resource "aws_codestarconnections_connection" "github" {
  name          = "ticket-gh-${var.env}"
  provider_type = "GitHub"
  tags          = { Name = "ticket-codestar-github-${var.env}" }
}

# ── 아티팩트 S3 버킷 ──
resource "aws_s3_bucket" "artifacts" {
  bucket        = "ticket-pipeline-artifacts-${var.env}-${var.account_id}"
  force_destroy = true
  tags          = { Name = "ticket-pipeline-artifacts-${var.env}" }
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── CodeBuild IAM 역할 ──
resource "aws_iam_role" "codebuild" {
  name = "ticket-codebuild-${var.env}"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "codebuild.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
  tags = { Name = "ticket-codebuild-role-${var.env}" }
}

resource "aws_iam_role_policy" "codebuild" {
  name = "ticket-codebuild-policy-${var.env}"
  role = aws_iam_role.codebuild.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:GetBucketLocation"]
        Resource = [aws_s3_bucket.artifacts.arn, "${aws_s3_bucket.artifacts.arn}/*"]
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken", "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer", "ecr:BatchGetImage",
          "ecr:PutImage", "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart", "ecr:CompleteLayerUpload"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = ["s3:PutObject", "s3:GetObject", "s3:ListBucket", "s3:DeleteObject"]
        Resource = [
          "arn:aws:s3:::${var.frontend_bucket}",
          "arn:aws:s3:::${var.frontend_bucket}/*"
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["cloudfront:CreateInvalidation"]
        Resource = "*"
      }
    ]
  })
}

# ── CodeBuild 프로젝트 (docker 빌드 → ECR push) ──
resource "aws_codebuild_project" "backend" {
  name         = "ticket-backend-build-${var.env}"
  service_role = aws_iam_role.codebuild.arn

  artifacts { type = "CODEPIPELINE" }

  environment {
    compute_type                = "BUILD_GENERAL1_SMALL"
    image                       = "aws/codebuild/amazonlinux2-x86_64-standard:5.0"
    type                        = "LINUX_CONTAINER"
    privileged_mode             = true # docker 빌드 필요
    image_pull_credentials_type = "CODEBUILD"

    environment_variable {
      name  = "AWS_ACCOUNT_ID"
      value = var.account_id
    }
    environment_variable {
      name  = "AWS_DEFAULT_REGION"
      value = var.region
    }
    environment_variable {
      name  = "ECR_REPO_URL"
      value = var.ecr_repo_url
    }
    environment_variable {
      name  = "CONTAINER_NAME"
      value = var.container_name
    }
  }

  source {
    type      = "CODEPIPELINE"
    buildspec = "ticket-booking/backend/buildspec.yml"
  }

  tags = { Name = "ticket-codebuild-${var.env}" }
}

# ── CodeBuild 프로젝트 (프론트 static export → S3 sync → CloudFront invalidation) ──
resource "aws_codebuild_project" "frontend" {
  name         = "ticket-frontend-build-${var.env}"
  service_role = aws_iam_role.codebuild.arn

  artifacts { type = "CODEPIPELINE" }

  environment {
    compute_type                = "BUILD_GENERAL1_SMALL"
    image                       = "aws/codebuild/amazonlinux2-x86_64-standard:5.0"
    type                        = "LINUX_CONTAINER"
    image_pull_credentials_type = "CODEBUILD"

    environment_variable {
      name  = "FRONTEND_BUCKET"
      value = var.frontend_bucket
    }
    environment_variable {
      name  = "CF_DISTRIBUTION_ID"
      value = var.frontend_distribution_id
    }
  }

  source {
    type      = "CODEPIPELINE"
    buildspec = "ticket-booking/frontend/buildspec.yml"
  }

  tags = { Name = "ticket-codebuild-frontend-${var.env}" }
}

# ── CodePipeline IAM 역할 ──
resource "aws_iam_role" "pipeline" {
  name = "ticket-pipeline-${var.env}"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "codepipeline.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
  tags = { Name = "ticket-pipeline-role-${var.env}" }
}

resource "aws_iam_role_policy" "pipeline" {
  name = "ticket-pipeline-policy-${var.env}"
  role = aws_iam_role.pipeline.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:GetBucketLocation", "s3:ListBucket"]
        Resource = [aws_s3_bucket.artifacts.arn, "${aws_s3_bucket.artifacts.arn}/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["codestar-connections:UseConnection"]
        Resource = aws_codestarconnections_connection.github.arn
      },
      {
        Effect   = "Allow"
        Action   = ["codebuild:BatchGetBuilds", "codebuild:StartBuild"]
        Resource = [aws_codebuild_project.backend.arn, aws_codebuild_project.frontend.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "ecs:DescribeServices", "ecs:DescribeTaskDefinition", "ecs:DescribeTasks",
          "ecs:ListTasks", "ecs:RegisterTaskDefinition", "ecs:DeregisterTaskDefinition",
          "ecs:UpdateService", "ecs:TagResource"
        ]
        Resource = "*"
      },
      {
        Effect    = "Allow"
        Action    = ["iam:PassRole"]
        Resource  = "*"
        Condition = { StringLike = { "iam:PassedToService" = "ecs-tasks.amazonaws.com" } }
      }
    ]
  })
}

# ── CodePipeline (Source → Build → Deploy) ──
resource "aws_codepipeline" "this" {
  name     = "ticket-pipeline-${var.env}"
  role_arn = aws_iam_role.pipeline.arn

  artifact_store {
    location = aws_s3_bucket.artifacts.bucket
    type     = "S3"
  }

  stage {
    name = "Source"
    action {
      name             = "GitHub"
      category         = "Source"
      owner            = "AWS"
      provider         = "CodeStarSourceConnection"
      version          = "1"
      output_artifacts = ["source_output"]
      configuration = {
        ConnectionArn        = aws_codestarconnections_connection.github.arn
        FullRepositoryId     = "${var.github_owner}/${var.github_repo}"
        BranchName           = var.github_branch
        DetectChanges        = "true" # main push 시 자동 트리거
        OutputArtifactFormat = "CODE_ZIP"
      }
    }
  }

  stage {
    name = "Build"
    action {
      name             = "DockerBuild"
      category         = "Build"
      owner            = "AWS"
      provider         = "CodeBuild"
      version          = "1"
      input_artifacts  = ["source_output"]
      output_artifacts = ["build_output"]
      run_order        = 1
      configuration    = { ProjectName = aws_codebuild_project.backend.name }
    }
    action {
      name             = "FrontendBuildDeploy"
      category         = "Build"
      owner            = "AWS"
      provider         = "CodeBuild"
      version          = "1"
      input_artifacts  = ["source_output"]
      output_artifacts = ["frontend_output"]
      run_order        = 1
      configuration    = { ProjectName = aws_codebuild_project.frontend.name }
    }
  }

  stage {
    name = "Deploy"
    action {
      name            = "ECSDeploy"
      category        = "Deploy"
      owner           = "AWS"
      provider        = "ECS"
      version         = "1"
      input_artifacts = ["build_output"]
      configuration = {
        ClusterName = var.ecs_cluster_name
        ServiceName = var.ecs_service_name
        FileName    = "imagedefinitions.json"
      }
    }
  }

  tags = { Name = "ticket-pipeline-${var.env}" }
}

output "connection_arn" { value = aws_codestarconnections_connection.github.arn }
output "pipeline_name" { value = aws_codepipeline.this.name }
