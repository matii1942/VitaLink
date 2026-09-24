# ADR 0009 — Ward data stops where critical care begins

- **Status:** Accepted
- **Date:** 2026-09-23

## Context

Reviewing the first ward board built from the simulator's data, a clinician on
this project found NEWS2 aggregates of 10 to 16 on general medical and surgical
admissions, sustained across dozens of six-hourly rounds.

The scoring engine was right. With the respiratory rate, saturation, blood
pressure and temperature all in their worst bands at once, the Royal College of
Physicians' chart sums to those numbers; the theoretical maximum is 20.

The data was wrong. A patient scoring 12 is not charted on a general ward every
six hours for two days. The RCP puts the threshold for an emergency response —
urgent assessment by a team with critical care competencies, and consideration
of transfer to a higher level of care — at an aggregate of **7**. Beyond that the
ward either escalates the patient or loses them. ADR 0002 already limits this
project's scope to general wards; a record of a ward holding a patient at 12 for
two days contradicts that scope from the inside.

It also emptied the product of its purpose. If the worst patient on the board
scores 14, the board is useless: anybody can see a 14. NEWS2 earns its keep by
catching the 5 before it becomes a 7.

Two further facts shaped the rule. One reading of 7 is an event and not a
verdict: hypoxia answers to oxygen and fever to antibiotics, and patients cross
the threshold once and come back. And a bed asked for is not a bed given — a
patient waiting for one is still physically in the ward, and is the most
compromised person in it.

## Decision

An admission now has three states, and the observations decide which:

1. **In a bed.** The ordinary case.
2. **A critical care bed has been asked for.** Reached when the patient's
   condition sits at or above the emergency threshold for two consecutive
   rounds. The admission stays open — `dischargedAt` is still null, the patient
   is still on the ward board, and rounds go on being charted — and the ward
   board sorts them above every scored patient.
3. **Ended**, with where the patient went recorded: home, intensive care, or the
   coronary care unit. Which critical care unit depends on the ward: cardiology
   escalates to coronary care, the others to intensive care.

An escalation overrides whatever ending the admission was built with. A patient
who deteriorated did not go home.

The simulator does not compute NEWS2. Scoring is VitaLink's job, and a second
implementation of a clinical chart living in the simulator is precisely how the
two drift apart. The generator uses its own severity parameter as the proxy, and
the two constants were **measured** against the real engine over 600 simulated
patients rather than guessed:

| severity | median aggregate | note |
| --- | --- | --- |
| 0.50 | 7 | the emergency response threshold |
| 0.68 | 9 | the ceiling |
| 0.70 | 10 | the Glasgow starts to drop; any level below alert adds 3 at once |

New confusion is tied to the same 0.50, not to a threshold of its own. On the
chart, confusion scores 3 by itself, which is a red score and an escalation; any
other number would let the dataset contain a confused patient nobody escalated.

## Consequences

Measured over 600 simulated patients, the highest aggregate on an admission that
was never escalated is **9**, and every observation of 10 or more belongs to an
admission with a bed already requested — a patient who is confused, hypoxic and
waiting. That is a record a hospital would produce. Around 11% of admissions
escalate, and roughly a third of those are still waiting when the dataset is
generated.

The ward board has a state above `high`, and a patient can appear on it with no
score of their own to explain their position. A consumer reading the board has to
handle that.

Three fields now travel the whole pipeline — WSDL, legacy codes, normaliser,
database, API, board — for one clinical fact. That is the cost of the anti
corruption layer, and this ADR is the first change that pays it end to end.

The generator is no longer a function of the admission alone: the ending of an
admission depends on its observations. Anything that reorders those two steps
will produce admissions whose ending contradicts their chart.
