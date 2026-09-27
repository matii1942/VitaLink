/**
 * What the API says about a summary.
 *
 * The shape is built around one idea: a consumer must never have to guess
 * whether the paragraph it is showing is current. `state` answers that on
 * every response, `reason` says why when it is not, and `throughRecordedAt`
 * says which observation the text actually covers — so a ward screen can put
 * "as of the 06:00 round" under it and be telling the truth.
 *
 * `text` is null rather than absent when there is nothing to show. A field
 * that disappears is a field a consumer forgets to handle.
 */
export const SUMMARY_DISCLAIMER =
  'Generated from the observations recorded for this admission. Derived text, not a clinical record.';

export interface BudgetView {
  spentUsd: number;
  limitUsd: number;
  remainingUsd: number;
  /** ISO 8601. The month this spend covers, in UTC. */
  periodStart: string;
}

export interface SummaryView {
  admissionId: string;
  text: string | null;
  /**
   * current   — written from the most recent observation on file.
   * stale     — real, but the admission has been observed since.
   * unavailable — nothing has ever been written for this admission.
   */
  state: 'current' | 'stale' | 'unavailable';
  /** Why it is not current. Null exactly when state is 'current'. */
  reason: string | null;
  generatedAt: string | null;
  /** The observation the text covers, not the moment it was written. */
  throughRecordedAt: string | null;
  roundsUsed: number | null;
  model: string | null;
  promptVersion: string | null;
  disclaimer: string;
  budget: BudgetView;
}

export interface StoredSummary {
  admissionId: string;
  text: string;
  throughObservationId: string;
  throughRecordedAt: Date;
  roundsUsed: number;
  model: string;
  promptVersion: string;
  generatedAt: Date;
}

export function toSummaryView(
  admissionId: string,
  stored: StoredSummary | null,
  state: SummaryView['state'],
  reason: string | null,
  budget: BudgetView,
): SummaryView {
  return {
    admissionId,
    text: stored?.text ?? null,
    state,
    reason,
    generatedAt: stored?.generatedAt.toISOString() ?? null,
    throughRecordedAt: stored?.throughRecordedAt.toISOString() ?? null,
    roundsUsed: stored?.roundsUsed ?? null,
    model: stored?.model ?? null,
    promptVersion: stored?.promptVersion ?? null,
    disclaimer: SUMMARY_DISCLAIMER,
    budget,
  };
}
