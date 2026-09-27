# Architecture decision records

Short notes recording *why* something in VitaLink is built the way it is.

A decision belongs here when it constrains future work — when someone
reading the code later could reasonably wonder "why not the obvious way?"
and deserves an answer. Bugs do not belong here; they belong in the commit
that fixed them.

Records are numbered in the order they are written and never renumbered.
A record is never edited to say something different: if a decision is
reversed, a new record supersedes it and both stay.

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-deterministic-synthetic-data.md) | Synthetic data is reproducible; the clock is injected | Accepted |
| [0002](0002-scope-is-general-wards.md) | Scope is general wards, not intensive care | Accepted |
| [0003](0003-news2-scale-is-received-not-inferred.md) | The NEWS2 scale is received, never inferred | Accepted |
| [0004](0004-consciousness-arrives-as-glasgow.md) | Consciousness arrives as Glasgow, and the conversion is lossy | Accepted |
| [0005](0005-news2-is-implemented-as-published.md) | NEWS2 is implemented exactly as published, limitations included | Accepted |
| [0006](0006-glasgow-to-acvpu-mapping.md) | How Glasgow is converted to ACVPU | Accepted |
| [0007](0007-accepted-dependency-advisories.md) | Two dependency advisories are accepted, not force-fixed | Accepted |
| [0008](0008-api-does-not-serve-national-ids.md) | The API does not serve national identity numbers | Accepted |
| [0009](0009-ward-data-stops-at-critical-care.md) | Ward data stops where critical care begins | Accepted |
| [0010](0010-ward-board-query-measured.md) | The ward board is one lateral join, and carries no extra index | Accepted |
| [0011](0011-lambda-keeps-the-fast-query-compiler.md) | The deployment keeps Prisma's fast query compiler | Accepted |
| [0012](0012-summaries-are-verified-derived-text.md) | A summary is derived text, and every figure in it is verified | Accepted |
| [0013](0013-summary-cache-follows-observations.md) | The summary cache is invalidated by observation, not by clock | Accepted |
| [0014](0014-model-prices-are-configuration.md) | Model prices are configuration, and the budget is checked before the call | Accepted |
| [0015](0015-summary-endpoint-is-a-read-through-cache.md) | The summary is a read-through cache behind a GET, and that GET is open | Accepted |
| [0016](0016-the-public-demo-is-a-recorded-snapshot.md) | The public demo is a recorded snapshot, not a deployment | Accepted |

## Template

```markdown
# ADR NNNN — <short title>

- **Status:** Accepted
- **Date:** YYYY-MM-DD

## Context

What situation forced a choice. The facts, not the conclusion.

## Decision

What was decided, stated plainly and in the present tense.

## Consequences

What this makes easier, what it makes harder, and what rule it
imposes on code written from now on.
```
