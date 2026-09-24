# ADR 0010 — The ward board is one lateral join, and carries no extra index

- **Status:** Accepted
- **Date:** 2026-09-24

## Context

The ward board is the only query in VitaLink written by hand. Everything else
goes through Prisma. It answers one question — every patient currently in a
ward, with their most recent observation and the NEWS2 score of it — and that
question has two idiomatic shapes in PostgreSQL:

- `DISTINCT ON (admissionId)` over the observations of the ward, which keeps the
  first row of each group under an `ORDER BY` that starts with the group key.
- `LEFT JOIN LATERAL (... ORDER BY recordedAt DESC LIMIT 1) ON TRUE`, which asks
  for one row per admission.

They are not equivalent. `DISTINCT ON` reads the observations and groups them,
so an admission with no observations is not in the result at all: a patient
admitted an hour ago, whose vital signs nobody has taken yet, disappears from
the board. That is the patient a board exists to surface. The `LEFT` in the
lateral join is what keeps them.

Correctness settled the choice. Whether it also costs less had to be measured,
because a plan's cost is not a matter of opinion and the honest answer might
have been that the safe version is the slow one.

## Decision

The board is the lateral join, and the schema gains **no index** for it.

### What was measured

`EXPLAIN (ANALYZE, BUFFERS)` on both shapes, against the same database, after
`ANALYZE`, at two sizes. Everything was in shared buffers: no plan read a single
page from disk.

| | 134 open beds · 7 532 observations | 1 025 open beds · 56 378 observations | growth |
| --- | --- | --- | --- |
| lateral join | 1.75 ms · 1 092 buffers | **10.24 ms** · 10 420 buffers | 5.9× |
| `DISTINCT ON` | 4.00 ms · 329 buffers | **29.87 ms** · 2 452 buffers | 7.5× |

The data grew 7.5×. The lateral join grew 5.9× and `DISTINCT ON` grew 7.5×, so
the gap widened from 2.3× to 2.9×. That is the shape of the two plans showing
up as numbers: the lateral join's work scales with **the beds that are
occupied**, and `DISTINCT ON` scales with **every observation ever recorded in
that ward**. A ward holds tens of patients however long the hospital runs; its
history does not stop growing.

Inside the lateral join, the index is used as intended:

```
Index Scan Backward using "Observation_admissionId_recordedAt_idx"
  Index Cond: ("admissionId" = a."admissionId")
  (actual time=0.002..0.003 rows=2 loops=1025)
```

Two rows read per admission, three microseconds each.

### Why no index on `Admission (ward, dischargedAt)`

The filter is a sequential scan of the admissions table, and at 3 000 rows it
costs **0.236 ms of 10.24 ms — 2.3% of the query**. An index would save two
tenths of a millisecond, and cost a structure to maintain on every write and a
migration to justify. The planner's estimate for that scan was 1 032 rows
against 1 025 actual, so it is not guessing either.

This is worth revisiting when the admissions table reaches a size where a
sequential scan of it stops being free — on the order of a hundred thousand
rows, which is years of a real hospital. The way to know is to run the same
`EXPLAIN` again, not to reason about it.

## Consequences

The measurement rests on everything being cached. If the working set outgrew
memory, the lateral join's thousand random index lookups and `DISTINCT ON`'s two
sequential scans would no longer cost the same per buffer, and the comparison
would have to be redone rather than assumed.

Two smaller findings, recorded because they will look like oversights otherwise:

- `observationCount`, the per-admission total on each board row, is **30% of the
  query's buffers** (3 112 of 10 420) for a number nobody acts on. If the board
  ever needs to be faster, that field is the first thing to drop — before any
  index.
- The planner inserts a `Memoize` node over the score lookup that reports
  `Hits: 0, Misses: 1025`. Every observation id is distinct, so it can never hit.
  It is a cheap bet that does not pay off, and not something this project can or
  should override.

An earlier reading of the plan flagged the `Incremental Sort` above the lateral
join as worth removing, by extending the index to include `observationId`. The
measurement says otherwise: the `LIMIT 1` stops the index scan after two rows,
so that sort orders two rows per admission. There was nothing there to fix.
