output "api_url" {
  description = "The public address of the read API."
  value       = aws_lambda_function_url.api.function_url
}

output "database_host" {
  description = "The database's hostname. Reaching it still needs the password and an allowed address."
  value       = aws_db_instance.main.address
}

output "schedule_state" {
  description = "Whether the hourly synchronisation is armed."
  value       = aws_scheduler_schedule.sync.state
}

output "database_url" {
  description = <<-TEXT
    The connection string, for applying migrations and opening Prisma Studio
    from the machine whose address is allowed. Read it with:

      terraform output -raw database_url

    It contains the password, so it is marked sensitive and does not appear in
    the ordinary output of an apply.
  TEXT
  value       = local.database_url
  sensitive   = true
}

output "hospital_soap_url" {
  description = "Where the functions find the simulated hospital, inside the VPC."
  value       = local.hospital_soap_url
}

output "hospital_instance_id" {
  description = <<-TEXT
    For opening a shell on the machine without an SSH port or a key pair:

      aws ssm start-session --target <this> --region us-east-2

    Useful when the service does not come up. The startup script logs to
    /var/log/cloud-init-output.log.
  TEXT
  value       = aws_instance.hospital.id
}
