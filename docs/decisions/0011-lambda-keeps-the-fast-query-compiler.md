# ADR 0011 — The deployment keeps Prisma's fast query compiler

- **Status:** Accepted
- **Date:** 2026-09-25

## Context

The Lambda package is 8.77 MB, and 53% of it — 4.66 MB — is `@prisma/client`.
Prisma 7 has no Rust engine binary to ship, which is true and misleading: the
engine was compiled to WebAssembly and embedded as base64 inside a JavaScript
file, and base64 costs a third more than the bytes it carries.

Prisma 7.3 added a lever for exactly this. The generator takes
`compilerBuild = "small"`, which swaps a 4.37 MB query compiler for a 2.21 MB
one and, in Prisma's words, trades speed for size.

Taking it looked obviously right for Lambda, where every cold start reads the
whole package. Three predictions about bundle size had already been wrong on
this project by the time the question came up, so it was left open until the
deployment could answer it.

## Decision

Keep the default, `fast`.

### What the first deployment measured

Three consecutive requests to the deployed function, read from its CloudWatch
report lines:

| | duration | billed | memory |
| --- | --- | --- | --- |
| `/health`, cold | 554 ms + **658 ms init** | 1213 ms | 151 MB |
| `/health`, warm | **4 ms** | 5 ms | 151 MB |
| `/patients`, first query | **1105 ms** | 1106 ms | **176 MB** |

Three things follow.

**The cold start is already cheap.** 658 ms to read and parse 8.77 MB. A 2.16 MB
saving might take 150 ms off it.

**The first query is the expensive one**, at 1105 ms for a query that returned
no rows — and memory rose 25 MB at that moment, which is the WebAssembly
compiler being instantiated on first use rather than at startup. It is a
per-environment cost, not a per-request one, but it lands on a user.

**So `small` would trade away the wrong thing.** It would save roughly 150 ms of
the cheap phase and make the expensive one slower, because a smaller compiler
compiles more slowly. The lever points the wrong way for this workload.

## Consequences

The package stays at 8.77 MB, and the cold start stays around 1.2 seconds
end to end. For an API that a ward dashboard polls, and whose environment stays
warm between polls, that is paid once and then never again — the warm path is
4 ms.

This is measured on one workload with one shape. A function invoked rarely
enough to be cold every time would weigh these numbers completely differently,
and should re-measure rather than inherit this decision.

Two smaller observations from the same report, recorded so nobody has to
rediscover them:

- **The init duration is billed.** 1213 ms billed against 554 ms of handler
  time. A cold start costs money, not only latency.
- **The function is over-provisioned**: 176 MB used of 512 MB. Memory on Lambda
  also buys CPU, so halving it would halve the processor and could make the cold
  start worse. That is another measurement, not another guess.
