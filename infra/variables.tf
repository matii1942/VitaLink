variable "region" {
  description = "AWS region. Ohio is among the cheapest, and this is a one-user deployment."
  type        = string
  default     = "us-east-2"
}

variable "name" {
  description = "Prefix for every resource name, so they are findable in the console."
  type        = string
  default     = "vitalink"
}

variable "developer_ip" {
  description = <<-TEXT
    The single address allowed to reach the database from outside AWS, as a CIDR
    such as "203.0.113.4/32". It exists so migrations can be applied and Prisma
    Studio can be opened from a laptop.

    Home connections usually get a new address every few days, and when yours
    changes this value has to change with it. That is the cost of not opening
    the database to everyone, and it is worth paying.
  TEXT
  type        = string

  validation {
    condition     = can(cidrnetmask(var.developer_ip))
    error_message = "developer_ip must be a CIDR block, for example 203.0.113.4/32."
  }
}

variable "database_name" {
  description = "The database inside the instance."
  type        = string
  default     = "vitalink"
}

variable "database_username" {
  description = "The master user. The password is generated and never typed."
  type        = string
  default     = "vitalink"
}

variable "database_instance_class" {
  description = "db.t4g.micro is the smallest Graviton class and the cheapest that runs PostgreSQL 16."
  type        = string
  default     = "db.t4g.micro"
}

variable "legacy_soap_url" {
  description = <<-TEXT
    Where the hospital's SOAP service lives. Every function needs it set, even
    the read API, because the module that builds the client reads it when the
    application starts — deliberately, so a missing value stops the process at
    once instead of surfacing as a failed sync an hour later.

    Until the simulator is deployed inside this VPC there is nothing at the
    other end, which is why the schedule below ships disabled.
  TEXT
  type        = string
  default     = "http://hospital.invalid/hospital?wsdl"
}

variable "schedule_enabled" {
  description = "Whether the hourly synchronisation actually fires."
  type        = bool
  default     = false
}

variable "schedule_expression" {
  description = "When the sync runs. Hourly, on the hour, in UTC."
  type        = string
  default     = "cron(0 * * * ? *)"
}

variable "log_retention_days" {
  description = <<-TEXT
    CloudWatch keeps logs forever by default, and charges for the storage
    forever with them. A week is plenty to debug a deployment that is brought
    up to be demonstrated.
  TEXT
  type        = number
  default     = 7
}
