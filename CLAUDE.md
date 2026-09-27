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

**Expand every abbreviation, every time, with no exceptions**, in parentheses,
in Spanish. CI (Continuous Integration), VPC (Virtual Private Cloud), npm (Node
Package Manager), ORM (Object-Relational Mapper) — including the ones already
explained in an earlier message, and including the ones that feel too basic to
bother with. Matías asked for this twice; the repetition is what makes the
vocabulary stick, and he is the one who gets to decide what helps him learn.

The clinical abbreviations are the other way round: NEWS2, ACVPU, GCS and the
rest are vocabulary he already has and does not need unpacked.

Explain the reasoning, not only the result. Say what was measured rather than
what was assumed, and say plainly when something was wrong.

## The notebook

`NOTAS-DE-APRENDIZAJE.md` at the repository root is Matías's own notebook, in
Spanish, and it is git-ignored — it is for him, not for the public repository.

**Append to it as the work happens, not at the end.** Every time a concept gets
explained in conversation, or a mistake teaches something, it goes in that file
in the same turn. Conversations get compacted and end; the file survives, and
reconstructing an explanation later from a summary loses exactly the part worth
keeping.

Each entry pairs the concept with the moment that taught it — "esbuild does not
support decorator metadata, and I found out because the deployment would have
compiled cleanly and failed in AWS". The incident is what makes it stick, and
it is what turns into a good answer in an interview.

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
