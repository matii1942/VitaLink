# ADR 0016 — The public demo is a recorded snapshot, not a deployment

- **Status:** Accepted
- **Date:** 2026-09-27

## Context

The infrastructure is destroyed when nobody is working on the project. That is
deliberate: the whole AWS side runs under a five dollar monthly cap (ADR 0014
and `infra/README.md`), and a database left running to serve twenty-five
synthetic patients to nobody is the single easiest way to spend that cap on
nothing. The consequence is that a link to the deployed dashboard is a link to
something switched off, and a reader who cannot open it has to take the
screenshots on trust.

Three ways to give that reader a working link:

**Leave the stack running.** Honest and live, and it bills every hour of every
month for a page that is opened a handful of times. It also leaves a public
function URL and a database on the internet for the same reason.

**Re-implement the API in the browser.** A mock that answers the four
endpoints. It is the version a reader should trust least: the thing on screen
would no longer be this project's code, and a demo whose data was produced by
code written for the demo proves nothing about the code that is not.

**Record the real answers once and serve those.** Run the real API against a
real PostgreSQL loaded from the simulator, call the four endpoints the
dashboard reads, and keep the responses verbatim.

## Decision

The demo is the third. `apps/web/src/demo/snapshot.json` holds the recorded
responses; `apps/web/src/demo/demo.ts` looks a path up in them. The
substitution happens in `get()` in `api.ts` — the single point where a request
leaves the application — so the hook, the cancellation, the loading and error
states and every screen above it are the same code in both builds. Nothing in
the demo re-implements an endpoint.

Two consequences are handled rather than hidden:

- **The clock keeps moving and the recording does not.** Every instant in the
  recording is shifted forward by the time elapsed since capture, so the
  intervals the screens actually show stay right and the handover notes stay
  true to the rounds beneath them. A date of birth and the budget period are
  not instants in the recording and are left alone.
- **The reader is told.** The demo build renders one paragraph, first thing on
  the page, saying what it is: synthetic patients, recorded responses, the
  capture date, and that the summaries were written by a language model and
  passed the verifier.

The demo is built with `npm run build:demo` in `apps/web`, which runs
`vite build --mode demo`. `vite.config.ts` turns that mode into
`import.meta.env.VITE_DEMO` — in the config rather than in a `.env` file, so
that nothing about the demo depends on an environment variable being set
right on whatever machine builds it, and so the bundler can drop the branch
that is not taken. The demo build also swaps `BrowserRouter` for
`HashRouter`, because a static host answering `/admissions/ADM-000016` with a
404 would break a reload before React ever ran.

## Consequences

The link works, costs nothing, and cannot leak: there is no database and no
key behind it, and the only data in it is synthetic and already in the
repository.

The recording ages. It is a point in time, and re-recording it means running
the stack again and replacing one file. That is the price of not paying for a
database, and it is written down here so the next person knows the snapshot is
a build artefact with a date on it rather than a live system.

The summaries in the recording were produced through the real pipeline — real
fact sheet, real budget gate, real verifier, real ledger — with the provider
replaced by a client that returns text written for each fact sheet. All 17
passed verification, and the ledger recorded 31,337 millionths of a dollar for
the set. The provider's own HTTP call remains the one part of the summary
pipeline this project has never exercised against the real thing (`README.md`,
"What is not true yet"), and the demo does not change that.
