/**
 * What the API says about a ward and its board.
 */
import type { AdmissionWithPatient, ObservationView } from '../admissions/admissions.dto.js';

/**
 * The open admissions of one ward, counted by the band of their most recent
 * score.
 *
 * `awaitingCriticalCare` is an overlay, not a sixth band: a patient whose
 * critical care bed has been asked for is also counted in whichever risk band
 * their score falls. That is deliberate, and it is the same arithmetic the
 * ward board's counters already do — the five numbers there overlap for the
 * same reason. The four risk bands plus `unscored` do partition the open
 * admissions, so they sum to `openAdmissions`.
 *
 * `unscored` is not a rounding error worth hiding. It is the patient nobody
 * has taken the vital signs of, or one under sixteen, whom this system does
 * not score (ADR 0005).
 */
export interface WardRisk {
  awaitingCriticalCare: number;
  high: number;
  medium: number;
  lowMedium: number;
  low: number;
  unscored: number;
}

export interface WardSummary {
  ward: string;
  /** Patients currently in a bed. */
  openAdmissions: number;
  /** Every admission ever recorded for this ward, open or closed. */
  totalAdmissions: number;
  /** Those currently in a bed, by band. See WardRisk. */
  risk: WardRisk;
}

export interface WardBoardRow extends AdmissionWithPatient {
  /** Null when nobody has recorded vital signs for this admission yet. */
  latestObservation: ObservationView | null;
}

export interface WardBoard {
  ward: string;
  /** When this snapshot was taken. A board is a moment, not a document. */
  generatedAt: string;
  openAdmissions: number;
  /**
   * The rule the rows are sorted by, sent with them so a consumer does not have
   * to reverse-engineer it — and so that changing it is a visible change.
   */
  orderedBy: string;
  rows: WardBoardRow[];
}
