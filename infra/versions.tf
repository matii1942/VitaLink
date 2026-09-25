terraform {
  required_version = ">= 1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }

  # State is local, in this folder, and git-ignored. It contains the database
  # password in clear text. A team needs it in S3 with a lock table, so two
  # people cannot apply at once and nobody keeps the only copy on a laptop;
  # a single developer's portfolio does not, and pretending otherwise would
  # add a bucket to bootstrap before anything else works.
}

provider "aws" {
  region = var.region

  # Every resource gets these, which is what makes an unexpected line on the
  # bill traceable to the thing that caused it.
  default_tags {
    tags = {
      Project   = "VitaLink"
      ManagedBy = "Terraform"
    }
  }
}
