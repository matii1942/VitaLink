/**
 * What the API says about a ward and its board.
 */
import type { AdmissionWithPatient, ObservationView } from '../admissions/admissions.dto.js';

export interface WardSummary {
  ward: string;
  /** Patients currently in a bed. */
  openAdmissions: number;
  /** Every admission ever recorded for this ward, open or closed. */
  totalAdmissions: number;
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
