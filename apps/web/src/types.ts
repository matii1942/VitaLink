/**
 * The shapes the API sends, restated here.
 *
 * These are copied from the API's own data transfer objects rather than
 * imported from them. That looks like duplication and is a deliberate seam:
 * the browser talks to the API over HTTP, and what arrives is whatever that
 * HTTP response contained — not whatever the API's source happens to say
 * today. Importing the server's types would let the compiler promise things
 * about a deployed service it has never contacted.
 *
 * The rule that keeps the copy honest: these describe the JSON on the wire.
 * If the API changes a field, this file changes in the same commit.
 */

export interface PatientBrief {
  mrn: string;
  familyName: string;
  givenName: string;
  birthDate: string;
  age: number;
  sex: string;
  news2Scale: number | null;
}

export interface News2Parameters {
  respirationRate: number | null;
  oxygenSaturation: number | null;
  supplementalOxygen: number | null;
  systolicBP: number | null;
  pulse: number | null;
  consciousness: number | null;
  temperature: number | null;
}

export interface ScoreView {
  status: string;
  notEligibleReason: string | null;
  aggregate: number | null;
  /** low | low-medium | medium | high */
  risk: string | null;
  partial: boolean | null;
  redScore: boolean | null;
  scaleUsed: number | null;
  scaleSource: string | null;
  parameters: News2Parameters | null;
  missing: string[];
  engineVersion: string;
  computedAt: string;
}

export interface ObservationView {
  observationId: string;
  admissionId: string;
  recordedAt: string;
  respirationRate: number | null;
  oxygenSaturation: number | null;
  respiratorySupport: string;
  systolicBP: number | null;
  pulse: number | null;
  glasgow: { eye: number | null; verbal: number | null; motor: number | null; total: number };
  temperature: number | null;
  recordedBy: string | null;
  score: ScoreView | null;
}

export interface AdmissionSummary {
  admissionId: string;
  mrn: string;
  admittedAt: string;
  dischargedAt: string | null;
  active: boolean;
  awaitingCriticalCare: boolean;
  criticalCareRequest: { unit: string; requestedAt: string } | null;
  dischargeDestination: string | null;
  ward: string;
  admissionType: string;
  sourceUnit: string | null;
  diagnosis: string | null;
  firstAdmission: boolean;
  observationCount: number;
}

export interface AdmissionWithPatient extends AdmissionSummary {
  patient: PatientBrief;
}

export interface WardBoardRow extends AdmissionWithPatient {
  latestObservation: ObservationView | null;
}

export interface WardBoard {
  ward: string;
  generatedAt: string;
  openAdmissions: number;
  orderedBy: string;
  rows: WardBoardRow[];
}

export interface WardSummary {
  ward: string;
  openAdmissions: number;
  totalAdmissions: number;
}

export interface BudgetView {
  spentUsd: number;
  limitUsd: number;
  remainingUsd: number;
  periodStart: string;
}

export interface SummaryView {
  admissionId: string;
  text: string | null;
  state: 'current' | 'stale' | 'unavailable';
  reason: string | null;
  generatedAt: string | null;
  throughRecordedAt: string | null;
  roundsUsed: number | null;
  model: string | null;
  promptVersion: string | null;
  disclaimer: string;
  budget: BudgetView;
}

export interface Page<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
