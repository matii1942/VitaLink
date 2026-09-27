# ADR 0012 — A summary is derived text, and every figure in it is verified

- **Status:** Accepted
- **Date:** 2026-09-27

## Context

Sprint 5 adds a clinical summary: a short handover note, written by a language
model, describing one admission for the nurse taking over the shift.

A language model asked to summarise a chart will, sooner or later, write a
number nobody measured. Not wildly — a respiration rate of 22 where the chart
says 24, a saturation "improving to 96%" that was never recorded. The failure
mode is not nonsense. It is a plausible clinical fact, in the right units, in
a sentence that reads like every other sentence around it, and the person
reading it at a shift change does not have the observation table open beside
it to check.

VitaLink already refuses to guess in places where guessing would be cheaper:
the NEWS2 scale is received rather than inferred (ADR 0003), a partial score is
marked as a lower bound (ADR 0005), a deliberate non-score is recorded rather
than skipped. A generated paragraph that quietly invents a vital sign would
undo all of it.

## Decision

Every figure in a generated summary is checked against the figures that were
handed to the model, and a summary containing one that was not is **discarded**
— not corrected, not flagged for review.

The check is possible because the fact sheet and the list of permitted figures
are produced by one function, in one pass (`src/summaries/facts.ts`). A number
reaches the prompt by being registered, and registering it is what puts it on
the list. There is no second function reading the same rows, so the two cannot
drift apart.

A rejected summary is written to the ledger with status `rejected` and its
reason, and the previous summary is served in its place, labelled stale.

Every response carries a disclaimer naming the text as derived from the
observations of that admission and not a clinical record.

## Consequences

Invented figures are impossible. Two things remain possible and are stated
here so that nobody mistakes the guarantee for a larger one:

- numbers written as words — "three episodes" of something that never happened;
- wrong claims containing no numbers — "the patient is improving" when the
  trend is upward.

The prompt forbids both, and a prompt is a request rather than a guarantee. The
defence against them is that the observations are served on the same endpoint
family as the summary, and the summary never replaces them.

A rejection costs money: the call was billed before the answer was read. That
is the correct trade, and the ledger records it so the rejection rate is a
query rather than an impression.
