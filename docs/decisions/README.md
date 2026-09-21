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
