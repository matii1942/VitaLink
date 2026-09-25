# The AWS account

What is already set up, so nobody has to remember it or ask again. Nothing
secret goes in this file: no account number, no access keys, no passwords.
Credentials live in `aws configure` on the machine that needs them, and nowhere
else.

> Lines marked **(confirmar)** are what the repository believes to be true and
> has not verified. Correct them the first time you notice they are wrong.

## Region

`us-east-2` (Ohio). Chosen for price rather than latency: this is a portfolio
deployment with one user, and Ohio is among the cheapest regions for the
services here. It is also what `AWS_REGION` says in `.env.example`.

## Guardrails, set up before anything was created

- **Budget: "VitaLink Monthly Cap", US$ 5 per month**, with email alerts, plus a
  cost anomaly monitor. Both confirmed active in the console.
  A budget does not stop anything — it tells you. There is no way to make AWS
  hard-stop spending, which is exactly why the alert has to exist before the
  first resource does.

  One thing to check on it: whether it counts spending that credits are paying
  for. If it excludes credit-covered usage, the US$ 5 alert stays silent for
  months and then fires the day the credits run out, which is the day it stops
  being an early warning. Including them makes it warn while everything is still
  free, which is what an alert is for.
- **MFA on the root user.** (confirmar)
- **IAM user `vitalink-dev`** for day to day work; root only for billing.
  (confirmar: the user's name and which policies are attached)

## Free tier

AWS changed the free tier in July 2025. Accounts opened after that get **US$ 100
in credits on sign-up, up to US$ 100 more earned through usage, and a free plan
lasting six months or until the credits run out** — not the old model of twelve
months of free usage per service. Over thirty services stay free permanently;
Lambda's million monthly requests is one of them.

**This account is on the credits model.** As of 24 September 2026:

| Credit | Amount | Issued | Expires |
| --- | --- | --- | --- |
| AWS Free Tier | US$ 100 | 18/09/2026 | 18/09/2027 |
| Explore AWS: set up a cost budget | US$ 20 | 18/09/2026 | 18/09/2027 |

**US$ 120 remaining, US$ 0 used.** The credits run a year; the free plan itself
is six months from sign-up, so it ends around 18 March 2027.

So a managed PostgreSQL is not free by usage here: a `db.t4g.micro` costs on the
order of US$ 13 a month, paid out of the credits.

That is affordable, and it decides how the deployment is operated rather than
what it contains. Left running, the database alone would spend the credits in
about seven months for nothing. Brought up to be demonstrated and destroyed
afterwards, the same demonstration costs cents. This is why the infrastructure
is code, and why `terraform destroy` is part of the routine here.

## Resources that predate this project

The account already shows usage from S3, Secrets Manager, AWS Glue, KMS and SNS,
none of it VitaLink's. Month-to-date cost is zero, so it is either tiny or
covered by credits — but Secrets Manager charges per secret per month and Glue
is not cheap, and this project is about to depend on those same credits. Worth
finding and deleting if they are leftovers. **(confirmar qué son)**

## Things that quietly cost money

Written down because each one has surprised somebody with a bill:

- **NAT Gateway** — about US$ 32 a month, in no free tier, ever. The Sprint 4
  architecture deliberately has none.
- **Public IPv4 addresses** — charged by the hour since 2024, including while
  the instance they belong to is stopped.
- **RDS storage and snapshots** survive the deletion of the instance, and go on
  being charged.
- An **idle load balancer** costs the same as a busy one.

## Tearing it down

The infrastructure is Terraform, so the deployment is not meant to stay up. It
goes up to be demonstrated and comes down afterwards; the repository keeps the
code that rebuilds it. `terraform destroy` is a normal part of the workflow
here, not a failure.
