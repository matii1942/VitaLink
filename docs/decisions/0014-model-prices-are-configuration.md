# ADR 0014 — Model prices are configuration, and the budget is checked before the call

- **Status:** Accepted
- **Date:** 2026-09-27

## Context

The summary endpoint spends real money on a personal account with a hundred
and twenty dollars of credit on it. A spending limit is not a nicety here.

Two facts make a limit awkward to enforce. The provider's prices are not ours
and change without notice. And the cost of a call cannot be known before
making it, because the length of the answer is not known before it is written.

## Decision

**Prices are read from the environment**, in United States dollars per million
tokens, with the published list price of the configured model as the default.
They are checked against the provider's pricing page, and the date of that
check is recorded beside the defaults in `.env.example`.

**Money is stored as a whole number of millionths of a dollar.** Never a
floating point number, which cannot represent tenths exactly and is compared
against a threshold here; and not cents either, because one call costs a small
fraction of one and a month of them would round to zero.

**The gate runs before the call, against the worst case.** Input tokens are
estimated pessimistically from the prompt already in hand — three characters
per token, where real tokenisers average closer to four — and output tokens
are not estimated at all: the request carries a hard ceiling, so the worst
case is that ceiling. A call is refused when the month's spend plus that worst
case would cross the limit.

**The spend is a `SUM` over the ledger**, computed fresh on each check, not a
counter kept in a column. Every call is written to the ledger, including the
ones that failed and the ones whose answers were thrown away.

The budget period is a UTC calendar month, deliberately not the provider's
billing cycle.

## Consequences

Measured on a six-round fact sheet, the worst case is 2 336 millionths of a
dollar — about 2 140 calls before a five dollar limit is reached — against a
realistic 1 176, or roughly 4 250 calls. The gate is therefore about twice as
cautious as reality, which is the right direction for a limit to err in.

A stale price in the environment makes every budget decision wrong while
nothing appears to fail. The date in `.env.example` is the only defence, and it
is a weak one: this is the thing to re-check before deploying with a real key.

The UTC month and the provider's invoice month disagree at the edges by a few
hours. Against a five dollar ceiling that is a rounding error, and it is
written down here so nobody rediscovers it as a bug.
