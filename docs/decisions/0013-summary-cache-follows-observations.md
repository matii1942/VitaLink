# ADR 0013 — The summary cache is invalidated by observation, not by clock

- **Status:** Accepted
- **Date:** 2026-09-27

## Context

Generating a summary costs money and takes a second or two. Storing it is
obvious. Deciding when the stored one has stopped being true is not.

The reflex is a time to live: the summary expires after an hour, or two, or
four. Every caching layer in ordinary use works that way, because for most
resources time is a decent proxy for change.

Here it is a bad one, in both directions. A patient whose vital signs have not
been taken since the last summary has not changed — the text is exactly as
true at hour six as it was at hour one, and regenerating it produces an almost
identical paragraph at full price. A patient observed twice in twenty minutes
during a deterioration has changed twice, and a one-hour expiry serves a
handover note describing a situation that has since escalated.

A summary is not stale because time passed. It is stale because somebody took
the patient's vital signs again.

## Decision

Each stored summary records `throughObservationId` — the most recent
observation it was written from — and `promptVersion`.

A summary is current when **both** hold:

- the newest observation on the admission is still the one it was written
  from, and
- the prompt that produced it is still the prompt in force.

Anything else is stale and triggers a regeneration, subject to the budget. No
clock is consulted anywhere in the decision.

## Consequences

Cost tracks clinical activity rather than traffic. Pressing refresh on a
stable patient is free, for ever. A ward in trouble generates more summaries,
which is the ward where they are worth paying for.

The prompt version in the condition means that editing the prompt invalidates
every stored summary at once, without a migration and without a script: the
next request for each admission notices and rewrites it. This is why
`PROMPT_VERSION` must be bumped whenever the text changes — a prompt edited
without it leaves old text in circulation with no way to find it.

The API reports `throughRecordedAt` on every response, so a consumer can say
which round the paragraph actually covers instead of implying it is live.

An observation edited in place — same identifier, changed values — would not
invalidate the summary. VitaLink never does this: observations are raw
clinical data and are never modified after the fact (see the schema comment on
`Observation`), so the case cannot arise while that rule holds.
