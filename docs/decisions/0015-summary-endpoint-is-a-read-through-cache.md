# ADR 0015 — The summary is a read-through cache behind a GET, and that GET is open

- **Status:** Accepted
- **Date:** 2026-09-27

## Context

`GET /admissions/:admissionId/summary` can spend money and write two rows. A
GET is meant to be safe.

The read-through cache is the classic exception: the resource is "the current
summary of this admission", and producing it is how it is read. The exception
is normally granted to a call that is merely slow, though, not to one that is
billed — and the deployed API has no authentication at all. The Lambda
function URL is public, which until now meant that the worst a stranger could
do was read twenty-five synthetic patients.

The alternative shape is `POST` to generate and `GET` to read. It is more
correct and it makes every consumer do two round trips, the second of which
usually returns what the first already produced.

## Decision

The endpoint stays a `GET`, and the cost is bounded from three sides instead
of by authentication:

- repeated requests for the same admission cost nothing until a new
  observation arrives (ADR 0013);
- the monthly budget refuses the call outright once the limit is reached
  (ADR 0014), and degrades to the stored summary rather than failing;
- the answer is capped before it is asked for.

**The function URL stays open only while `ANTHROPIC_API_KEY` is unset in the
deployed environment.** Putting a real key on a public endpoint is not covered
by this decision. A shared secret in a header is the intended next step, and
it is a prerequisite for deploying Sprint 5, not a follow-up to it.

## Consequences

Consumers stay simple: one request, one resource, correct headers.

The three bounds hold against an ordinary reader and against a crawler. They
do not hold against somebody who walks every admission identifier once a round
on purpose — that costs the full budget, legitimately, which is exactly what
the budget exists to cap.

The condition above is a rule on deployment, not on code, which makes it the
kind of rule that gets forgotten. It belongs in the Sprint 5 deployment
checklist in `infra/README.md`.
