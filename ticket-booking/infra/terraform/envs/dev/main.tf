# dev 환경 (make.md §5 - dev/staging/prod 환경 분리, baseline #5)
# - 모든 리소스 Name 태그에 "ticket" 포함 (default_tags + 리소스별 Name)
# - DB 비밀번호는 Secrets Manager로 관리 (하드코딩 금지)
# - CodePipeline(CodeStar GitHub 연결)로 빌드/배포 자동화, main push 트리거
terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "aws" {
  region  = var.region
  profile = var.profile
  # 모든 리소스에 공통 태그 자동 부여
  default_tags {
    tags = {
      Project     = "ticket"
      Environment = "dev"
      ManagedBy   = "terraform"
    }
  }
}

variable "region" {
  type    = string
  default = "ap-northeast-2"
}
variable "profile" {
  type    = string
  default = "czy1023-naver"
}
variable "github_owner" {
  type    = string
  default = "vnfmsqkek3"
}
variable "github_repo" {
  type    = string
  default = "book-train-ticket-website-test"
}

data "aws_caller_identity" "current" {}

locals {
  env = "dev"
}

module "network" {
  source = "../../modules/network"
  env    = local.env
}

module "alb" {
  source            = "../../modules/alb"
  env               = local.env
  vpc_id            = module.network.vpc_id
  public_subnet_ids = module.network.public_subnet_ids
  alb_sg_id         = module.network.alb_sg_id
}

# DB 비밀번호 (Secrets Manager)
module "secrets" {
  source = "../../modules/secrets"
  env    = local.env
}

module "rds" {
  source             = "../../modules/rds"
  env                = local.env
  private_subnet_ids = module.network.private_subnet_ids
  db_sg_id           = module.network.db_sg_id
  db_username        = module.secrets.db_username
  db_password        = module.secrets.db_password
  instance_class     = "db.t3.small"
}

module "elasticache" {
  source             = "../../modules/elasticache"
  env                = local.env
  private_subnet_ids = module.network.private_subnet_ids
  redis_sg_id        = module.network.redis_sg_id
  node_type          = "cache.t3.micro"
}

# ECR (CodeBuild가 이미지 push)
module "ecr" {
  source = "../../modules/ecr"
  env    = local.env
}

module "ecs" {
  source               = "../../modules/ecs"
  env                  = local.env
  vpc_id               = module.network.vpc_id
  private_subnet_ids   = module.network.private_subnet_ids
  alb_target_group_arn = module.alb.target_group_arn
  backend_sg_id        = module.network.backend_sg_id
  # 최초 apply 시점엔 이미지가 없음 → :latest 참조.
  # CodePipeline이 첫 실행에서 이미지를 push하면 태스크가 정상 기동됨.
  backend_image = "${module.ecr.repository_url}:latest"
  desired_count = 1
  environment = {
    APP_ENV                     = local.env
    NODE_ENV                    = "production"
    PORT                        = "4000"
    WS_PORT                     = "4001"
    DB_HOST                     = module.rds.endpoint
    DB_NAME                     = "ticket_booking"
    DB_USER                     = module.secrets.db_username
    REDIS_HOST                  = module.elasticache.endpoint
    CONCURRENT_PROCESSING_LIMIT = "500"
    SEAT_LOCK_TTL_SECONDS       = "300"
  }
  # DB 비밀번호는 Secrets Manager에서 주입 (컨테이너 env: DB_PASSWORD)
  secrets = {
    DB_PASSWORD = module.secrets.password_secret_ref
  }
  secret_arns = [module.secrets.secret_arn]
}

# CI/CD (CodeStar GitHub 연결 + CodePipeline + CodeBuild)
module "cicd" {
  source           = "../../modules/cicd"
  env              = local.env
  github_owner     = var.github_owner
  github_repo      = var.github_repo
  github_branch    = "main"
  ecr_repo_url     = module.ecr.repository_url
  ecr_repo_arn     = module.ecr.repository_arn
  ecs_cluster_name = module.ecs.cluster_name
  ecs_service_name = module.ecs.service_name
  container_name   = module.ecs.container_name
  region           = var.region
  account_id       = data.aws_caller_identity.current.account_id
}

output "alb_dns" { value = module.alb.dns_name }
output "ecr_repository_url" { value = module.ecr.repository_url }
output "db_secret_arn" { value = module.secrets.secret_arn }
output "codestar_connection_arn" { value = module.cicd.connection_arn }
output "pipeline_name" { value = module.cicd.pipeline_name }
