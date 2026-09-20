# ADR 0001 — Synthetic data is reproducible; the clock is injected

- **Status:** Accepted
- **Date:** 2026-09-20

## Context

The hospital simulator invents its own patients, admissions and
observations. Nothing is persisted: the dataset is built in memory when the
service starts.

The first version of the generator produced a different dataset on every
call, even with the same seed passed to Faker. The cause was not the seed.
`faker.date.birthdate({ mode: 'age' })` anchors the generated date on the
current instant unless a reference date is supplied, so two calls a few
milliseconds apart produced different birth dates — and, through the
age-dependent fields, different patients.

A dataset that changes on every restart is unusable for the work that
follows. Integration tests cannot assert against a known patient. A
deteriorating patient cannot be demonstrated twice. Two developers cannot
discuss the same record.

## Decision

The generator is deterministic: the same seed produces the same dataset.

Any value derived from the current time enters the generator as an explicit
`now` parameter. Nothing inside the generator reads the clock. The default
is midnight UTC of the current day, which is stable for a whole day, so
restarts within a day agree while the data stays roughly current.

## Consequences

Tests can name a patient and assert on their values, because `MRN-000003`
is the same 86-year-old woman in every run.

Any code that needs the current time — the observation timeline, the
"admitted N days ago" calculation, anything added later — takes it as an
argument. Calling `new Date()` deep inside generation logic reintroduces
the bug quietly, and is treated as a defect in review.

The dataset shifts by one day at midnight UTC. Tests must not assert on
absolute dates, only on intervals and ordering.

Faker's locale is `es` (`fakerES`). There is no Argentinian locale; `AR` in
Faker is Arabic, not Argentina. Family names therefore read as generic
Spanish rather than specifically Argentinian. National ID numbers are
derived from the patient's birth year, because Argentinian DNI numbers were
issued in rough chronological order and an older patient carrying a low
number is what makes the data look real to someone who has handled it.
