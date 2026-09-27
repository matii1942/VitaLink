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

variable "soap_port" {
  description = "The port the simulated hospital listens on, inside the VPC."
  type        = number
  default     = 8080
}

variable "hospital_instance_type" {
  description = <<-TEXT
    t4g.micro: two Graviton cores, one gigabyte, and the cheapest instance that
    comfortably runs a Node process serving a WSDL.
  TEXT
  type        = string
  default     = "t4g.micro"
}

variable "repository_url" {
  description = <<-TEXT
    Cloned by the instance on first boot. Public, so the machine needs no
    credentials of any kind — which is also why it can be given none.
  TEXT
  type        = string
  default     = "https://github.com/matii1942/VitaLink.git"
}

variable "hospital_patients" {
  description = <<-TEXT
    How many patients the simulated hospital serves. 25 is a demonstration; a
    few hundred is what makes a query measurement mean anything.
  TEXT
  type        = number
  default     = 25
}

variable "hospital_seed" {
  description = "Same seed, same patients, same trajectories. See ADR 0001."
  type        = number
  default     = 42
}

variable "schedule_enabled" {
  description = <<-TEXT
    Whether the hourly synchronisation actually fires. It is on now that there
    is a hospital inside the VPC for it to talk to; before that it would have
    failed every hour for ever, and an alarm that always rings is an alarm
    nobody hears.
  TEXT
  type        = bool
  default     = true
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
