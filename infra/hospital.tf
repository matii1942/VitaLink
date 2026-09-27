/**
 * The simulated hospital, inside the private network.
 *
 * This is the one piece of infrastructure whose placement is a statement about
 * the real world rather than about cost. A hospital information system does not
 * live on the public internet: it sits on the hospital's own network, behind
 * whatever the hospital's network people decided. An integration reaches it
 * from inside, or it does not reach it at all.
 *
 * It is also what makes the scheduled synchronisation possible at all. The
 * functions have no route to the internet — deliberately, because a NAT gateway
 * costs about US$ 32 a month — so a hospital on the public internet would be
 * unreachable from them. Putting it in the VPC is the honest arrangement and
 * the free one at the same time.
 *
 * The instance sits in a public subnet because it needs to fetch Node and clone
 * the repository on first boot, and the internet gateway that allows that is
 * free. Nothing can reach it from outside: the security group below opens one
 * port to one security group, and to nothing else.
 */

# The current Amazon Linux 2023 image for arm64, published by AWS as a parameter
# rather than hard-coded here. An AMI id pinned in a file is an id that is wrong
# in six months and in every other region.
data "aws_ssm_parameter" "amazon_linux" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

resource "aws_security_group" "hospital" {
  name        = "${var.name}-hospital"
  description = "The simulated hospital. One port, one caller."
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "SOAP, from the functions and from nothing else"
    from_port       = var.soap_port
    to_port         = var.soap_port
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda.id]
  }

  # Outbound is open because first boot has to fetch Node and clone the
  # repository. After that the instance talks to nobody.
  egress {
    description = "Package downloads on first boot"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.name}-hospital" }
}

# --------------------------------------------------------------------------
# Getting a shell without opening a port
# --------------------------------------------------------------------------

data "aws_iam_policy_document" "ec2_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "hospital" {
  name               = "${var.name}-hospital"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume_role.json
}

# Session Manager, so the instance can be reached for debugging without an SSH
# port, without a key pair to keep safe, and without a bastion. The instance
# opens the connection outwards; nothing listens.
resource "aws_iam_role_policy_attachment" "hospital_ssm" {
  role       = aws_iam_role.hospital.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "hospital" {
  name = "${var.name}-hospital"
  role = aws_iam_role.hospital.name
}

# --------------------------------------------------------------------------
# The machine
# --------------------------------------------------------------------------

resource "aws_instance" "hospital" {
  ami           = data.aws_ssm_parameter.amazon_linux.value
  instance_type = var.hospital_instance_type
  subnet_id     = aws_subnet.public[0].id

  vpc_security_group_ids = [aws_security_group.hospital.id]
  iam_instance_profile   = aws_iam_instance_profile.hospital.name

  # Needed on first boot to download Node and the repository. It costs about
  # US$ 3.60 a month on its own, which is the price of not running a NAT
  # gateway at ten times that.
  associate_public_ip_address = true

  user_data = templatefile("${path.module}/hospital-user-data.sh", {
    node_version = trimspace(file("${path.module}/../.nvmrc"))
    repo_url     = var.repository_url
    soap_port    = var.soap_port
    patients     = var.hospital_patients
    seed         = var.hospital_seed
  })

  # Replace the instance when the startup script changes, rather than leaving a
  # machine running code nobody can find in the repository.
  user_data_replace_on_change = true

  root_block_device {
    volume_size = 8
    volume_type = "gp3"
    encrypted   = true
  }

  # Requires the newer metadata service, which is what stops a request forged
  # through the application from reading the instance's credentials.
  metadata_options {
    http_tokens   = "required"
    http_endpoint = "enabled"
  }

  tags = { Name = "${var.name}-hospital" }
}

locals {
  # The private address, not the public one. It is stable across a stop and a
  # start, and it is the only one the functions can reach anyway.
  hospital_soap_url = "http://${aws_instance.hospital.private_ip}:${var.soap_port}/hospital?wsdl"
}
