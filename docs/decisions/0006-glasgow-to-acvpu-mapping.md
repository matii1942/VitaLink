# ADR 0006 — How Glasgow is converted to ACVPU

- **Status:** Accepted
- **Date:** 2026-09-21

## Context

ADR 0004 established that consciousness arrives as Glasgow components and
that the conversion to ACVPU is lossy. This record fixes what the conversion
is.

The mapping was proposed from the definitions of both scales and reviewed
against ward practice. The review brought out the limitation that matters
most: on a ward, a Glasgow is read against the patient's baseline. A nurse
knows that a patient with dementia has always scored 4 on verbal response,
and that a patient with motor neurone disease cannot speak because of the
disease and not because they are confused. The Glasgow alone carries none
of that, and the hospital's contract does not send a baseline.

## Decision

| Glasgow | ACVPU |
| --- | --- |
| Eye 4 and verbal 5 | A — eyes open spontaneously and oriented |
| Eye 4, verbal below 5 | C — awake but not oriented |
| Eye 3 | V — opens eyes to voice |
| Eye 2 | P — opens eyes to pain |
| Eye 1, with any verbal or motor response | P — responds to a stimulus without opening the eyes |
| 1-1-1 (total 3) | U — no response of any kind |
| Components absent | not scoreable (ADR 0004) |

The conversion reads the components, never the total.

## Consequences

A patient whose verbal response is permanently below 5 — dementia, aphasia
after a stroke, motor neurone disease — is read as C at every round and
scores 3 for consciousness each time. NEWS2 means *new* confusion by C, and
the Glasgow cannot tell new from long-standing. For these patients the score
overstates risk persistently, which is the alarm-fatigue problem in its
purest form.

Resolving it needs a recorded baseline per patient, which the source does
not provide. It is accepted for now and revisited when a baseline becomes
available.
