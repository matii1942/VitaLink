/**
 * What the API says about an admission, an observation and its score.
 *
 * Two shapes deliberately differ from the database:
 *
 * The Glasgow components come back nested, as `glasgow: { eye, verbal, motor,
 * total }`, because that is what they are — one measurement in four parts. The
 * table stores them flat only because columns are flat.
 *
 * The seven per-parameter NEWS2 scores come back nested under `parameters`,
 * in the order of the rows on the printed chart. A consumer rendering the chart
 * can walk them; seven sibling fields called somethingScore would invite it to
 * hard-code the names in its own order.
 *
 * This file imports a value from the patients module, and the patients module
 * imports only types from this one. `import type` disappears at compile time,
 * so there is no cycle at runtime.
 */
import { toPatientBrief, type PatientBrief, type PatientRow } from '../patients/patients.dto.js';

export interface AdmissionRow {
  admissionId: string;
  mrn: string;
  admittedAt: Date;
  dischargedAt: Date | null;
  dischargeDestination: string | null;
  transferUnit: string | null;
  transferRequestedAt: Date | null;
  ward: string;
  admissionType: string;
  sourceUnit: string | null;
  diagnosis: string | null;
  firstAdmission: boolean;
}

export interface AdmissionSummary {
  admissionId: string;
  mrn: string;
  /** ISO 8601 with a zone. */
  admittedAt: string;
  dischargedAt: string | null;
  /** Derived from dischargedAt, so a consumer never has to know that rule. */
  active: boolean;
  /**
   * A critical care bed has been asked for and has not appeared. The patient
   * is still in the ward, and is the most compromised person in it (ADR 0009).
   */
  awaitingCriticalCare: boolean;
  /** The bed request, kept after the patient has gone. */
  criticalCareRequest: { unit: string; requestedAt: string } | null;
  /** home | intensive-care | coronary-care. Null while still in a bed. */
  dischargeDestination: string | null;
  ward: string;
  admissionType: string;
  sourceUnit: string | null;
  diagnosis: string | null;
  firstAdmission: boolean;
  observationCount: number;
}

/** An admission with the patient in it — what a ward list needs to be readable. */
export interface AdmissionWithPatient extends AdmissionSummary {
  patient: PatientBrief;
}

export interface ScoreView {
  /** 'scored', or 'not-eligible' for a deliberate non-score (ADR 0005). */
  status: string;
  notEligibleReason: string | null;
  /** Null when the observation was not scored. */
  aggregate: number | null;
  risk: string | null;
  /** True when a parameter was missing: the aggregate is a lower bound. */
  partial: boolean | null;
  /** True when any single parameter scored 3 — escalate regardless of the total. */
  redScore: boolean | null;
  scaleUsed: number | null;
  /** 'recorded' or 'assumed' (ADR 0003). */
  scaleSource: string | null;
  parameters: News2Parameters | null;
  /** The parameters that could not be scored. */
  missing: string[];
  engineVersion: string;
  computedAt: string;
}

/** The seven rows of the NEWS2 chart, in the order they are printed. */
export interface News2Parameters {
  respirationRate: number | null;
  oxygenSaturation: number | null;
  supplementalOxygen: number | null;
  systolicBP: number | null;
  pulse: number | null;
  consciousness: number | null;
  temperature: number | null;
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
  glasgow: {
    eye: number | null;
    verbal: number | null;
    motor: number | null;
    total: number;
  };
  temperature: number | null;
  recordedBy: string | null;
  /** Null only if the sync wrote the observation and has not scored it yet. */
  score: ScoreView | null;
}

export interface ScoreRow {
  status: string;
  notEligibleReason: string | null;
  aggregate: number | null;
  risk: string | null;
  partial: boolean | null;
  redScore: boolean | null;
  scaleUsed: number | null;
  scaleSource: string | null;
  respirationRateScore: number | null;
  oxygenSaturationScore: number | null;
  supplementalOxygenScore: number | null;
  systolicBPScore: number | null;
  pulseScore: number | null;
  consciousnessScore: number | null;
  temperatureScore: number | null;
  missing: string[];
  engineVersion: string;
  computedAt: Date;
}

export interface ObservationRow {
  observationId: string;
  admissionId: string;
  recordedAt: Date;
  respirationRate: number | null;
  oxygenSaturation: number | null;
  respiratorySupport: string;
  systolicBP: number | null;
  pulse: number | null;
  gcsEye: number | null;
  gcsVerbal: number | null;
  gcsMotor: number | null;
  gcsTotal: number;
  temperature: number | null;
  recordedBy: string | null;
}

export function toAdmissionSummary(row: AdmissionRow, observationCount: number): AdmissionSummary {
  return {
    admissionId: row.admissionId,
    mrn: row.mrn,
    admittedAt: row.admittedAt.toISOString(),
    dischargedAt: row.dischargedAt === null ? null : row.dischargedAt.toISOString(),
    active: row.dischargedAt === null,
    awaitingCriticalCare: row.transferUnit !== null && row.dischargedAt === null,
    criticalCareRequest:
      row.transferUnit === null || row.transferRequestedAt === null
        ? null
        : { unit: row.transferUnit, requestedAt: row.transferRequestedAt.toISOString() },
    dischargeDestination: row.dischargeDestination,
    ward: row.ward,
    admissionType: row.admissionType,
    sourceUnit: row.sourceUnit,
    diagnosis: row.diagnosis,
    firstAdmission: row.firstAdmission,
    observationCount,
  };
}

export function toAdmissionWithPatient(
  row: AdmissionRow & { patient: PatientRow },
  observationCount: number,
  now: Date,
): AdmissionWithPatient {
  return {
    ...toAdmissionSummary(row, observationCount),
    patient: toPatientBrief(row.patient, now),
  };
}

export function toScoreView(row: ScoreRow): ScoreView {
  return {
    status: row.status,
    notEligibleReason: row.notEligibleReason,
    aggregate: row.aggregate,
    risk: row.risk,
    partial: row.partial,
    redScore: row.redScore,
    scaleUsed: row.scaleUsed,
    scaleSource: row.scaleSource,
    // A non-scored observation has no per-parameter breakdown to send. An
    // object of seven nulls would read as "measured and scored zero".
    parameters:
      row.status === 'scored'
        ? {
            respirationRate: row.respirationRateScore,
            oxygenSaturation: row.oxygenSaturationScore,
            supplementalOxygen: row.supplementalOxygenScore,
            systolicBP: row.systolicBPScore,
            pulse: row.pulseScore,
            consciousness: row.consciousnessScore,
            temperature: row.temperatureScore,
          }
        : null,
    missing: row.missing,
    engineVersion: row.engineVersion,
    computedAt: row.computedAt.toISOString(),
  };
}

export function toObservationView(
  row: ObservationRow & { score: ScoreRow | null },
): ObservationView {
  return {
    observationId: row.observationId,
    admissionId: row.admissionId,
    recordedAt: row.recordedAt.toISOString(),
    respirationRate: row.respirationRate,
    oxygenSaturation: row.oxygenSaturation,
    respiratorySupport: row.respiratorySupport,
    systolicBP: row.systolicBP,
    pulse: row.pulse,
    glasgow: {
      eye: row.gcsEye,
      verbal: row.gcsVerbal,
      motor: row.gcsMotor,
      total: row.gcsTotal,
    },
    temperature: row.temperature,
    recordedBy: row.recordedBy,
    score: row.score === null ? null : toScoreView(row.score),
  };
}
