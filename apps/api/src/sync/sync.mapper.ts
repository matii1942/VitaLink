/**
 * Clinical model -> database rows.
 *
 * Every write is an upsert keyed by the hospital's own identifier. Running
 * the same sync twice therefore changes nothing, and an interrupted run is
 * completed by simply running again.
 *
 * Kept free of Prisma and NestJS so it can be tested on its own.
 */

import type { Admission, Observation, Patient } from '../domain/clinical.js';
import { NEWS2_ENGINE_VERSION } from '../news2/news2.js';
import type { ObservationScore } from '../news2/score-observation.js';

export function patientRow(p: Patient) {
  return {
    mrn: p.mrn,
    nationalId: p.nationalId,
    familyName: p.familyName,
    givenName: p.givenName,
    birthDate: p.birthDate,
    sex: p.sex,
    news2Scale: p.news2Scale,
  };
}

export function admissionRow(a: Admission) {
  return {
    admissionId: a.admissionId,
    mrn: a.mrn,
    admittedAt: a.admittedAt,
    dischargedAt: a.dischargedAt,
    dischargeDestination: a.dischargeDestination,
    // Flattened into two columns: a nullable embedded object is not a thing a
    // relational table has, and a table of its own for a one-to-one pair that
    // is never queried on its own would be a join for nothing.
    transferUnit: a.criticalCareRequest?.unit ?? null,
    transferRequestedAt: a.criticalCareRequest?.requestedAt ?? null,
    ward: a.ward,
    admissionType: a.admissionType,
    sourceUnit: a.sourceUnit,
    diagnosis: a.diagnosis,
    firstAdmission: a.firstAdmission,
  };
}

export function observationRow(o: Observation) {
  return {
    observationId: o.observationId,
    admissionId: o.admissionId,
    recordedAt: o.recordedAt,
    respirationRate: o.respirationRate,
    oxygenSaturation: o.oxygenSaturation,
    respiratorySupport: o.respiratorySupport,
    systolicBP: o.systolicBP,
    pulse: o.pulse,
    gcsEye: o.gcs.eye,
    gcsVerbal: o.gcs.verbal,
    gcsMotor: o.gcs.motor,
    gcsTotal: o.gcs.total,
    temperature: o.temperature,
    recordedBy: o.recordedBy,
  };
}

/**
 * A score, flattened into one row. A deliberate non-score (a patient under
 * 16) is stored too, with its reason: a record that says "not scored, and
 * why" is different from a record that is simply missing.
 */
export function scoreRow(score: ObservationScore) {
  if (score.status === 'not-eligible') {
    return {
      observationId: score.observationId,
      status: score.status,
      notEligibleReason: score.reason,
      aggregate: null,
      risk: null,
      partial: null,
      redScore: null,
      scaleUsed: null,
      scaleSource: null,
      respirationRateScore: null,
      oxygenSaturationScore: null,
      supplementalOxygenScore: null,
      systolicBPScore: null,
      pulseScore: null,
      consciousnessScore: null,
      temperatureScore: null,
      missing: [],
      engineVersion: NEWS2_ENGINE_VERSION,
    };
  }

  const { result } = score;
  return {
    observationId: score.observationId,
    status: score.status,
    notEligibleReason: null,
    aggregate: result.aggregate,
    risk: result.risk,
    partial: result.partial,
    redScore: result.redScore,
    scaleUsed: score.scaleUsed,
    scaleSource: score.scaleSource,
    respirationRateScore: result.parameters.respirationRate,
    oxygenSaturationScore: result.parameters.oxygenSaturation,
    supplementalOxygenScore: result.parameters.supplementalOxygen,
    systolicBPScore: result.parameters.systolicBP,
    pulseScore: result.parameters.pulse,
    consciousnessScore: result.parameters.consciousness,
    temperatureScore: result.parameters.temperature,
    missing: result.missing,
    engineVersion: NEWS2_ENGINE_VERSION,
  };
}

export type SyncStatus = 'succeeded' | 'partial' | 'failed';

/**
 * A run that finished but had to skip or refuse records is 'partial', not
 * 'succeeded': a green status must mean everything the hospital sent is now
 * in the database.
 */
export function finalStatus(issueCount: number): SyncStatus {
  return issueCount === 0 ? 'succeeded' : 'partial';
}
