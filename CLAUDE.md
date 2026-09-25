# Working agreements

Notes for whoever picks this project up next, including an AI assistant in a new
session with no memory of the last one. Everything here has already been agreed;
none of it needs to be asked again.

## Language

**The repository is in English. The conversation is in castellano.**

Code, comments, commit messages, documentation, ADRs, variable names, log lines
— all English. Talking about the work happens in Spanish.

The one deliberate exception is the simulated hospital's *data*: diagnoses,
ward codes, nurse names and the legacy codes in the WSDL (Web Services
Description Language) are Spanish, because that is what an Argentinian
hospital's system would actually emit. English comments describe Spanish data,
throughout `apps/legacy-sim`.

## How the work is divided

Claude writes, Matías reviews. Matías is the clinical authority: anything about
NEWS2, wards, deterioration or what a record means at the bedside is his call,
and Claude states the reasoning rather than deciding quietly.

## How to explain things

**Expand every abbreviation the first time it appears in a message**, in
parentheses, in Spanish. VPC (Virtual Private Cloud — red privada dentro de
AWS), HIS (Hospital Information System), ORM (Object-Relational Mapper). This
applies to cloud, networking and tooling acronyms; Matías is a career changer
from clinical work and the clinical vocabulary is the one he already has.

Explain the reasoning, not only the result. Say what was measured rather than
what was assumed, and say plainly when something was wrong.

## Verification

Claims about behaviour get checked by running something, not by asserting.
Measurements go into an ADR with their numbers — see
[0010](docs/decisions/0010-ward-board-query-measured.md), which records a query
choice and an index that was deliberately *not* added, with the timings that
justified both.

Predictions about size and cost have been wrong repeatedly in this project.
Measure first.

## Data and secrets

**Every patient record here is synthetic, generated with Faker.** No real
clinical data from any hospital, ever, not even anonymised and not even locally.
Health data is protected under Argentina's Ley 25.326 and a public repository is
the wrong place for it under any circumstances.

No credentials in the repository: `.env`, `.env.test`, `terraform.tfvars` and
Terraform state are all git-ignored. AWS access keys live in `aws configure` on
the machine that needs them and are never pasted into a chat.

## Where the standing decisions live

- [docs/decisions/](docs/decisions/) — the ADRs, numbered and never renumbered
- [docs/aws-account.md](docs/aws-account.md) — the AWS account's guardrails,
  credits and the costs worth knowing about
- [infra/README.md](infra/README.md) — what the deployment builds and why parts
  of it are deliberately missing
