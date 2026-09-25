/**
 * The network, and mostly what is not in it.
 *
 * There is no NAT gateway. A NAT costs about US$ 32 a month, has never been in
 * any free tier, and is the single most common way a hobby account produces a
 * surprising bill. Nothing here needs one: the functions talk to the database
 * over the VPC's own local route, and their logs reach CloudWatch through the
 * Lambda service rather than through the network the function sits in.
 *
 * The consequence is real and worth stating: a function in these private
 * subnets has no route to the internet at all. That is why the synchronisation
 * job cannot call a hospital that lives on the public internet, and why the
 * simulator is going to be placed inside this VPC instead — which is also
 * where a hospital information system sits in relation to an integration.
 */

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  # Two zones because an RDS subnet group requires them, not because anything
  # here is highly available. The instance is single-AZ: a second one would
  # double the cost to protect a portfolio deployment from a zone outage.
  azs = slice(data.aws_availability_zones.available.names, 0, 2)
}

resource "aws_vpc" "main" {
  cidr_block           = "10.20.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true # RDS hands out a hostname; without this it resolves to nothing.

  tags = { Name = var.name }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = var.name }
}

# --------------------------------------------------------------------------
# Public subnets: the database lives here, because reaching it from a laptop
# to apply migrations requires a route to the internet gateway. An internet
# gateway is free; only a NAT costs.
# --------------------------------------------------------------------------

resource "aws_subnet" "public" {
  count = 2

  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index)
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = false # Nothing here should get one by accident.

  tags = { Name = "${var.name}-public-${local.azs[count.index]}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = { Name = "${var.name}-public" }
}

resource "aws_route_table_association" "public" {
  count = length(aws_subnet.public)

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# --------------------------------------------------------------------------
# Private subnets: the functions live here. No route out, by design.
# --------------------------------------------------------------------------

resource "aws_subnet" "private" {
  count = 2

  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index + 10)
  availability_zone = local.azs[count.index]

  tags = { Name = "${var.name}-private-${local.azs[count.index]}" }
}

# A route table with no routes of its own. The VPC's implicit local route still
# applies, which is exactly what is wanted: reach the database, reach nothing
# else.
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.name}-private" }
}

resource "aws_route_table_association" "private" {
  count = length(aws_subnet.private)

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# --------------------------------------------------------------------------
# Security groups
# --------------------------------------------------------------------------

resource "aws_security_group" "lambda" {
  name        = "${var.name}-lambda"
  description = "The two functions. Identity, more than a firewall rule."
  vpc_id      = aws_vpc.main.id

  # Outbound is open because the only place these can reach is inside the VPC
  # anyway: there is no route to anywhere else.
  egress {
    description = "Anywhere the routing allows, which is the VPC and nothing more"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.name}-lambda" }
}

resource "aws_security_group" "database" {
  name        = "${var.name}-database"
  description = "PostgreSQL. Two ways in and no others."
  vpc_id      = aws_vpc.main.id

  # The functions, by group rather than by address. A Lambda's private address
  # changes whenever AWS feels like it; its security group does not. This is
  # the rule that makes the whole design work without opening a port to the
  # internet.
  ingress {
    description     = "The functions"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda.id]
  }

  # One address, for running migrations and opening Prisma Studio. This is the
  # line that has to change when the home address behind it does.
  #
  # No apostrophe in that description. AWS validates it against
  # ^[0-9A-Za-z_ .:/()#,@[]+=&;{}!$*-]*$ and refuses the whole security group
  # over a single punctuation mark.
  ingress {
    description = "The developer machine"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.developer_ip]
  }

  tags = { Name = "${var.name}-database" }
}
