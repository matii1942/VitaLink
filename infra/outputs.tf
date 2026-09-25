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
