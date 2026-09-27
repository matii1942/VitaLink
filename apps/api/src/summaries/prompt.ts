/**
 * The instructions, and the version stamp that goes with them.
 *
 * The version is bumped by hand whenever the text below changes. Without it
 * there is no way to answer the only question that matters after a prompt is
 * edited — "which of the stored summaries did the old one write?" — and the
 * answer decides whether they have to be regenerated or can be left alone.
 */
import type { LlmRequest } from './llm.client.js';

export const PROMPT_VERSION = 'handover-1';

/**
 * Two of these rules are not stylistic.
 *
 * "Every figure must appear in the fact sheet" is the rule that verify.ts
 * enforces afterwards. Stating it here does not make the check unnecessary —
 * an instruction is a request and a check is a guarantee — but it is what
 * makes the rejection rate low enough for the feature to be usable at all.
 *
 * "Say a measurement was not recorded" exists because the alternative
 * behaviour is to quietly omit it, and a handover that omits a missing blood
 * pressure reads exactly like a handover where the blood pressure was fine.
 */
export const SYSTEM_PROMPT = `You are writing the nursing handover note for one patient on a general hospital ward.

You will be given a fact sheet: the patient, the admission, and the most recent rounds of vital signs with their NEWS2 scores, most recent first.

Write three to five sentences of plain clinical prose for the nurse taking over the shift. Cover, in this order: who the patient is and why they are here; what the NEWS2 score has done across the rounds shown; which single parameter is driving it, if one is; and what the next shift should watch.

These rules are absolute:
- Use only what the fact sheet says. Every figure you write must appear in it exactly as written. Do not calculate, average, convert or estimate any number, including differences and percentages.
- Where the sheet says a measurement was not recorded, say so. Never fill a gap.
- Where an aggregate is marked a lower bound, never present it as the total.
- A red score escalates on its own, whatever the total is. Say so whenever the sheet reports one.
- Do not name a diagnosis, a drug, a dose, a treatment or an investigation that is not in the sheet.
- Write the note and nothing else: no heading, no preamble, no bullet points, no sign-off.`;

export function buildRequest(factSheet: string, maxOutputTokens: number): LlmRequest {
  return { system: SYSTEM_PROMPT, user: factSheet, maxOutputTokens };
}
