# ADR 0005 — NEWS2 is implemented exactly as published, limitations included

- **Status:** Accepted
- **Date:** 2026-09-21

## Context

The scoring table was transcribed from the Royal College of Physicians'
NEWS2 charts and checked row by row against independent sources before any
code was written. The check mattered: two of the first three automated
readings of the charts were wrong, because extracting tables from a PDF had
misaligned the columns and assumed a symmetry the table does not have. A
majority of those readings put a temperature of 39.1 °C at 3 points. It is
2. The final table agrees with the RCP's 2017 report and an NIHR report
reproducing it.

Reviewing the verified table raised a clinical objection: systolic pressures
from 111 to 219 mmHg score 0. A patient at 190 mmHg is not well, and NEWS2
does not notice. The RCP report does not explain the asymmetry. It does
state what the score was calibrated to predict — cardiac arrest, unplanned
ICU admission or death within 24 hours — and falling pressure, the signature
of shock, leads to those outcomes far more directly than the chronic
hypertension common on a ward. That reading is this project's, not the
RCP's.

The same report states who the score must not be used for: "children (ie
aged <16 years) or ... women who are pregnant", and that it may be
unreliable after spinal cord injury.

## Decision

The engine implements the published table exactly. No threshold is adjusted,
even where the objection to it is clinically sound. A modified table would no
longer be NEWS2: it could not be checked against the specification, staff
would not recognise its numbers, and no validation study would describe it.

Patients under 16 are not scored. VitaLink has their date of birth, so this
exclusion is enforced.

## Consequences

Hypertensive emergencies below 220 mmHg are invisible to the score. This is
a property of NEWS2, not a defect of the implementation, and it is stated
here so that nobody mistakes a score of 0 for a finding that the pressure
is fine.

Pregnancy and spinal cord injury cannot be excluded. The hospital's contract
carries neither, so VitaLink has no way to know it is scoring a pregnant
patient. Until the source provides that information, those scores exist and
must be read knowing they may not apply. This is the most important
limitation of the system and the first question a clinical reviewer should
ask.

Every band in the table has a boundary test on both sides. In a clinical
score the errors live at the edges — a respiratory rate of 20 scores 0 and
21 scores 2, and both are tested.
