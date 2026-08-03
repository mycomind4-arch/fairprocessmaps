variable "aws_region" {
  description = "AWS region"
  default     = "us-west-2"
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token"
  sensitive   = true
}

variable "environment" {
  description = "Environment name"
  default     = "prod"
}
