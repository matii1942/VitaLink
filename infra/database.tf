/**
 * PostgreSQL.
 *
 * Publicly accessible, and reachable by exactly two things: the functions'
 * security group, and one home address. "Publicly accessible" in RDS means the
 * instance gets a resolvable public name — it does not mean anyone can connect,
 * which the security group decides. The alternative, a private instance plus a
 * bastion or a VPN to run migrations through, is the right answer for a real
 * system and costs more than this whole deployment.
 */

resource "random_password" "database" {
  length = 32
  # RDS rejects several punctuation characters in a master password, and the
  # error arrives late and unhelpfully. Letters and digits at this length are
  # far beyond what anyone will guess.
  special = false
}

resource "aws_db_subnet_group" "main" {
  name       = var.name
  subnet_ids = aws_subnet.public[*].id
  tags       = { Name = var.name }
}

resource "aws_db_instance" "main" {
  identifier     = var.name
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.database_instance_class

  db_name  = var.database_name
  username = var.database_username
  password = random_password.database.result

  allocated_storage = 20
  storage_type      = "gp3"
  # Encryption at rest with the account's default key. It costs nothing and
  # there is no reason to run without it.
  storage_encrypted = true

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.database.id]
  publicly_accessible    = true

  # Single zone on purpose. Multi-AZ doubles the bill to survive something that
  # will not happen to a demonstration.
  multi_az = false

  # No automated backups and no final snapshot. Both cost storage that outlives
  # the instance, and everything in this database is synthetic and rebuilt by a
  # single sync. On a system holding real data both of these would be wrong.
  backup_retention_period = 0
  skip_final_snapshot     = true
  delete_automated_backups = true

  # This deployment is meant to be destroyed and rebuilt. Deletion protection
  # would turn that routine into a console visit.
  deletion_protection = false

  # Minor versions apply themselves in the maintenance window; major ones never
  # do, because a major upgrade is a decision.
  auto_minor_version_upgrade = true

  # Free, and the only way to see what the database was doing after the fact.
  enabled_cloudwatch_logs_exports = ["postgresql"]

  # Performance Insights and enhanced monitoring are both deliberately off:
  # useful, and neither free nor needed at this size.

  tags = { Name = var.name }
}

locals {
  # The connection string, assembled once and used by both functions and by the
  # output that migrations are run with.
  #
  # About those last two parameters, because the pair is not obvious and the
  # failure they prevent only appears after deployment.
  #
  # node-postgres, which the driver adapter uses, does not interpret sslmode the
  # way libpq does unless it is told to. Left alone, `sslmode=require` turns on
  # encryption *and* certificate verification — and RDS presents a certificate
  # signed by an Amazon authority that is not in Node's trust store, so every
  # query fails on a certificate nobody can validate.
  #
  # Setting `ssl` explicitly in code does not help: node-postgres merges the
  # parsed connection string *over* the options it was given, so the string
  # always wins. `uselibpqcompat=true` is read from the string itself and
  # restores libpq's meaning of `require`: encrypt, do not verify.
  #
  # The properly secure version is `sslmode=verify-full` with Amazon's CA bundle
  # shipped alongside the function and pointed at by `sslrootcert`. That is the
  # right answer for a system holding real data, and it is a file to carry, keep
  # current and test. Here the traffic never leaves the VPC and the data is
  # synthetic.
  database_url = format(
    "postgresql://%s:%s@%s:%d/%s?schema=public&sslmode=require&uselibpqcompat=true",
    var.database_username,
    random_password.database.result,
    aws_db_instance.main.address,
    aws_db_instance.main.port,
    var.database_name,
  )
}
