# prod 환경 (make.md §5, baseline #5) - Multi-AZ, 고가용성
terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

variable "region" {
  type    = string
  default = "ap-northeast-2"
}
variable "db_password" {
  type      = string
  sensitive = true
}
variable "backend_image" { type = string }

locals {
  env = "prod"
}

module "network" {
  source = "../../modules/network"
  env    = local.env
  cidr   = "10.2.0.0/16"
}

module "alb" {
  source            = "../../modules/alb"
  env               = local.env
  vpc_id            = module.network.vpc_id
  public_subnet_ids = module.network.public_subnet_ids
  alb_sg_id         = module.network.alb_sg_id
}

module "rds" {
  source             = "../../modules/rds"
  env                = local.env
  private_subnet_ids = module.network.private_subnet_ids
  db_sg_id           = module.network.db_sg_id
  db_password        = var.db_password
  instance_class     = "db.r6g.large"
}

module "elasticache" {
  source             = "../../modules/elasticache"
  env                = local.env
  private_subnet_ids = module.network.private_subnet_ids
  redis_sg_id        = module.network.redis_sg_id
  node_type          = "cache.r6g.large"
}

module "ecs" {
  source               = "../../modules/ecs"
  env                  = local.env
  vpc_id               = module.network.vpc_id
  private_subnet_ids   = module.network.private_subnet_ids
  alb_target_group_arn = module.alb.target_group_arn
  backend_sg_id        = module.network.backend_sg_id
  backend_image        = var.backend_image
  desired_count        = 4 # DLT 1000 동시 사용자 대응
  cpu                  = 1024
  memory               = 2048
  environment = {
    APP_ENV                     = local.env
    NODE_ENV                    = "production"
    DB_HOST                     = module.rds.endpoint
    REDIS_HOST                  = module.elasticache.endpoint
    CONCURRENT_PROCESSING_LIMIT = "500"
  }
}

output "alb_dns" { value = module.alb.dns_name }
