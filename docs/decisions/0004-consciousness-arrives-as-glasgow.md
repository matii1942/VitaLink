# ADR 0004 — Consciousness arrives as Glasgow, and the conversion is lossy

- **Status:** Accepted
- **Date:** 2026-09-20

## Context

NEWS2 scores level of consciousness on ACVPU: Alert, Confusion, Voice,
Pain, Unresponsive. Alert scores 0; anything else scores 3.

The ward this project is modelled on does not chart ACVPU. It charts a
Glasgow Coma Scale — eye opening 1–4, verbal response 1–5, motor response
1–6, totalling 3 to 15. That is what nursing records, and therefore what
the legacy system holds.

So the source system cannot supply the parameter the score needs. It
supplies a different, richer instrument that has to be converted.

The conversion is not clean. A total alone is not enough: distinguishing a
patient who responds to voice from one who responds only to pain depends on
the eye-opening component, and two patients with the same total of 11 can
have arrived there through combinations that mean different things at the
bedside. Mapping from a sum discards exactly the information the
destination scale is built on.

## Decision

The contract carries the three Glasgow components separately, alongside the
total. The consumer derives ACVPU from the components, never from the total.

Records migrated from the hospital's previous system carry only a total,
with the components null. For those, the consciousness parameter is marked
unscoreable rather than guessed, and the resulting NEWS2 score is flagged as
partial.

## Consequences

A conversion table from Glasgow components to ACVPU has to exist, be
written down, and be tested case by case. It is an approximation between two
instruments that were designed independently, so it is a clinical judgement
encoded in software and it is reviewed as one.

Some observations produce a partial score. The dashboard has to show that
honestly — a score computed from six of seven parameters is not the same
number as a score computed from seven, and presenting them identically
would be a lie of omission.

This is the shape of most real integration work: the source system is not
wrong and the standard is not wrong, they were simply built for different
purposes, and something in the middle has to reconcile them and be candid
about what it lost.
