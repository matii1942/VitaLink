/**
 * The two functions.
 *
 * Both run the same application. The API answers HTTP through a Function URL;
 * the synchronisation job runs on a schedule and serves nothing. They are
 * separate functions rather than one because they fail differently, scale
 * differently and are watched differently: a sync that takes four minutes
 * should not share a timeout with a request that should take fifty
 * milliseconds.
 *
 * There is no API Gateway. A Function URL is free, gives the function an HTTPS
 * endpoint, and this project needs nothing a gateway adds — no custom domain,
 * no usage plans, no request transformation. Adding one would be a line on the
 * bill and a box on the diagram in exchange for nothing.
 */

locals {
  functions = {
    api = {
      description = "The read API"
      source      = "${path.module}/../apps/api/dist-lambda/api"
      memory      = 512
      timeout     = 30
    }
    sync = {
      description = "The hourly synchronisation job"
      source      = "${path.module}/../apps/api/dist-lambda/sync"
      # More memory buys proportionally more CPU on Lambda, and this one is
      # CPU-bound: it normalises and scores thousands of observations. Paying
      # for a bigger slice that finishes sooner can cost less than a small one
      # that runs longer, since the bill is memory multiplied by duration.
      memory  = 1024
      timeout = 300
    }
  }

  environment = {
    NODE_ENV        = "production"
    DATABASE_URL    = local.database_url
    LEGACY_SOAP_URL = var.legacy_soap_url
  }
}

data "archive_file" "function" {
  for_each = local.functions

  type        = "zip"
  source_dir  = each.value.source
  output_path = "${path.module}/.build/${each.key}.zip"
}

# --------------------------------------------------------------------------
# Identity
# --------------------------------------------------------------------------

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${var.name}-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

# Writing logs, and creating the network interfaces a function needs to sit
# inside a VPC. Nothing else: these functions read and write one database and
# call no AWS API at all.
resource "aws_iam_role_policy_attachment" "lambda_vpc" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# --------------------------------------------------------------------------
# Logs
# --------------------------------------------------------------------------

# Declared here rather than left to Lambda, which creates them on first use
# with no expiry — and then charges for that storage for ever.
resource "aws_cloudwatch_log_group" "function" {
  for_each = local.functions

  name              = "/aws/lambda/${var.name}-${each.key}"
  retention_in_days = var.log_retention_days
}

# --------------------------------------------------------------------------
# The functions
# --------------------------------------------------------------------------

resource "aws_lambda_function" "function" {
  for_each = local.functions

  function_name = "${var.name}-${each.key}"
  description   = each.value.description
  role          = aws_iam_role.lambda.arn

  filename         = data.archive_file.function[each.key].output_path
  source_code_hash = data.archive_file.function[each.key].output_base64sha256

  runtime = "nodejs22.x"
  handler = "index.handler"

  # Graviton. Cheaper per millisecond than x86, and the bundle is JavaScript,
  # so there is nothing architecture-specific to worry about.
  architectures = ["arm64"]

  memory_size = each.value.memory
  timeout     = each.value.timeout

  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    # The database password is in here, encrypted at rest with the account's
    # default key and visible to anyone who can read the function's
    # configuration. Secrets Manager would be the better home for it, and from
    # a private subnet with no route out it would also need an interface
    # endpoint at about US$ 7 a month — more than the rest of this deployment.
    # The trade is deliberate, and it is recorded in the ADR.
    variables = local.environment
  }

  depends_on = [aws_cloudwatch_log_group.function]
}

# --------------------------------------------------------------------------
# The public address
# --------------------------------------------------------------------------

resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.function["api"].function_name
  authorization_type = "NONE"

  cors {
    # A browser dashboard is Sprint 6, and this is what will let it call the
    # API from wherever it ends up being served.
    allow_origins = ["*"]
    allow_methods = ["GET"]
    allow_headers = ["content-type"]
    max_age       = 3600
  }
}

# An unauthenticated Function URL still needs the permission spelled out.
resource "aws_lambda_permission" "api_url" {
  statement_id           = "AllowPublicFunctionUrlInvoke"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.function["api"].function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}
