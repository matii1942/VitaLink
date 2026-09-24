# ADR 0008 — The API does not serve national identity numbers

- **Status:** Accepted
- **Date:** 2026-09-23

## Context

The hospital sends a national identity number (DNI) with every patient, and
VitaLink stores it. It is worth storing: it is how the same person is recognised
across systems that do not share a medical record number, which is exactly the
reconciliation problem an integration service exists to solve.

It is also the only field in this model that identifies a person outside the
hospital. A medical record number is meaningless without access to the hospital
that issued it; a DNI is a person's identity everywhere, and in Argentina it is
personal data protected by Ley 25.326.

The read API has no authentication. Anything it returns is returned to whoever
can reach the port.

## Decision

The API does not include `nationalId` in any response. It is stored, it is
matched on during synchronisation, and it stops at the service boundary.

The response shapes in `patients.dto.ts` are written out field by field rather
than spreading a database row, and a test asserts the exact set of keys, so the
field cannot reappear because someone added a `...row` somewhere.

This is not deferred until authentication exists. When authentication exists,
serving identity numbers becomes a decision to make on purpose — with a reason,
a role that is allowed to see them, and a record of who looked — and it will
need a record of its own that supersedes this one.

## Consequences

A consumer that needs to reconcile patients against another hospital system
cannot do it through this API. That is the intended cost: such a consumer needs
an authenticated, audited endpoint, not a public list.

Every response shape in the API is written out explicitly. Returning a Prisma
row directly from a controller is not a shortcut in this codebase, it is a bug:
it is how a field nobody decided to publish gets published.
