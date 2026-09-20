# ADR 0003 — The NEWS2 scale is received, never inferred

- **Status:** Accepted
- **Date:** 2026-09-20

## Context

NEWS2 scores oxygen saturation on two different scales.

Scale 1 is the default, targeting 94–98%. Scale 2 is for patients in
chronic hypercapnic respiratory failure — in practice, advanced COPD — and
targets 88–92%. The lower target is not a tolerance. Giving such a patient
too much oxygen actively harms them: the hypoxic respiratory drive is
suppressed, ventilation–perfusion matching worsens, and the Haldane effect
releases further CO₂, together producing respiratory acidosis.

Scoring one of these patients on the wrong scale produces a wrong answer in
a way that matters. On a ward, a saturation of 92% in an advanced COPD
patient is the number that patient is supposed to have — and on Scale 1 it
raises an alarm. This is not hypothetical: it is the situation that
prompted this record.

Alarms that are correct by the algorithm and wrong in the room are how
staff learn to disregard alarms.

The tempting shortcut is to infer the scale from the data already present —
a patient on CPAP or non-invasive ventilation is frequently a Scale 2
patient. Frequently is not always, and the inference runs both ways: a
COPD patient on room air would be missed.

## Decision

The scale is a property of the patient, supplied by the source system and
set by a clinician. The scoring engine reads it. It never derives it from
respiratory support, diagnosis, age or any other field.

When the scale is absent, the engine scores on Scale 1 and marks the score
as having used a default rather than a recorded value.

## Consequences

Choosing Scale 1 as the fallback is deliberate, and it is the less bad of
two errors. A Scale 2 patient scored on Scale 1 scores higher than they
should: the system asks someone to go and look at a patient who is fine.
The reverse — defaulting to Scale 2 — would score a deteriorating Scale 1
patient lower than they are and delay a response. Between a false alarm and
a missed deterioration, the false alarm is survivable.

Refusing to score at all was considered and rejected: a patient with no
score is a patient with no automated safety net, which is worse than a
patient with an imperfect one.

Because the default is a clinical compromise rather than a correct answer,
it is recorded. Every score carries whether its scale was received or
assumed, so a ward with many assumed scales is visible as a data-quality
problem to fix at the source.

No code may set the scale from other fields. A pull request that does is
rejected regardless of how well the correlation holds — the correlation is
not the point, the authority is.
