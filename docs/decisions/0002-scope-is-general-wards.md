# ADR 0002 — Scope is general wards, not intensive care

- **Status:** Accepted
- **Date:** 2026-09-20

## Context

NEWS2 exists to catch a patient who is deteriorating between checks. On a
general ward, observations are charted on a round — roughly every six hours
in the ward this project is modelled on — and in the hours in between,
nobody is watching. A patient can slide a long way inside one gap, and the
whole value of an aggregate score is that it makes that slide visible at
the next set of observations.

Intensive care does not have that gap. The patient is on continuous
monitoring: saturation, pulse and pressure are on a screen at all times,
and staff are present. Adding a score computed every few hours on top of
continuous monitoring tells nobody anything they do not already know.

Ventilated patients also break the score's assumptions. A respiratory rate
set by a ventilator is not the patient's respiratory drive, and the
supplemental-oxygen parameter — which NEWS2 records as a yes or no — does
not describe a patient receiving invasive ventilation.

## Decision

VitaLink models admissions to general wards. Patients in intensive care are
out of scope: the simulator does not generate them, and the scoring engine
is not designed to handle them.

## Consequences

The simulated hospital emits only ward-appropriate respiratory support:
room air, nasal cannula, mask, CPAP and non-invasive ventilation. Invasive
and pressure-support modes were removed from the contract, because a patient
receiving them is not on a ward.

Everything the scoring engine assumes — that the respiratory rate is the
patient's own, that observations arrive intermittently, that a rising score
should trigger someone to go and look — holds only under this scope.
Extending VitaLink to intensive care would not be a matter of adding
patients; it would need a different clinical instrument.

Stating the scope is itself the point. A system that silently scored ICU
patients with a ward tool would produce numbers that look valid and are not.
