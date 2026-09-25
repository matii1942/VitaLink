/**
 * The hourly synchronisation.
 *
 * EventBridge Scheduler rather than an EventBridge rule: it is the service
 * built for this, it is cheaper per invocation, and it can be turned off
 * without being deleted — which matters here, because the schedule ships
 * disabled.
 *
 * It ships disabled because there is nothing at the other end yet. The
 * functions have no route to the internet by design, and the hospital
 * simulator is not inside the VPC yet. Creating a schedule that would fail
 * every hour, fill the logs and mark every run as an error would be worse than
 * creating none: an alarm that is always ringing is an alarm nobody hears.
 */

data "aws_iam_policy_document" "scheduler_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "${var.name}-scheduler"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume_role.json
}

data "aws_iam_policy_document" "scheduler_invoke" {
  statement {
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.function["sync"].arn]
  }
}

resource "aws_iam_role_policy" "scheduler_invoke" {
  name   = "${var.name}-scheduler-invoke"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler_invoke.json
}

resource "aws_scheduler_schedule" "sync" {
  name        = "${var.name}-sync"
  description = "Runs the hospital synchronisation"
  state       = var.schedule_enabled ? "ENABLED" : "DISABLED"

  # No jitter. An hourly integration job has no thundering herd to spread out,
  # and a run that starts at a known minute is a run that is easy to find in
  # the logs.
  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression          = var.schedule_expression
  schedule_expression_timezone = "UTC"

  target {
    arn      = aws_lambda_function.function["sync"].arn
    role_arn = aws_iam_role.scheduler.arn

    # One attempt. The job is idempotent, so a retry would be safe — but the
    # next hour is a retry, and a failure that repeats three times in a minute
    # only makes the logs harder to read.
    retry_policy {
      maximum_retry_attempts = 0
    }
  }
}
