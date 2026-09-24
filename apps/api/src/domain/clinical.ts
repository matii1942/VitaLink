/**
 * VitaLink's clinical model.
 *
 * These are a patient, an admission and an observation once every quirk of
 * the system they came from has been removed: real dates, real numbers, real
 * booleans, English values. Nothing downstream of the normaliser — the NEWS2
 * engine, the database, the API — ever sees the legacy format.
 */

export type Sex = 'male' | 'female' | 'unknown';
export type AdmissionType = 'urgent' | 'scheduled';
export type SourceUnit = 'emergency' | 'theatre' | 'cathlab' | 'transfer';
export type RespiratorySupport = 'room-air' | 'cannula' | 'mask' | 'cpap' | 'niv';
export type News2Scale = 1 | 2;

/** The two units a general ward escalates to. See ADR 0009. */
export type CriticalCareUnit = 'intensive-care' | 'coronary-care';

/** Where the patient went when the admission ended. */
export type DischargeDestination = 'home' | CriticalCareUnit;

/**
 * A critical care bed asked for, and the moment the ward asked.
 *
 * It survives the admission: after the patient has gone it is the record of
 * when the ward saw it coming, which is the question any review of a
 * deterioration starts from.
 */
export interface CriticalCareRequest {
  unit: CriticalCareUnit;
  requestedAt: Date;
}

export interface Patient {
  mrn: string;
  nationalId: string | null;
  familyName: string;
  givenName: string;
  /** A calendar date with no time of day, held as midnight UTC of that date. */
  birthDate: Date;
  sex: Sex;
  /** Null when the source never recorded it. See ADR 0003. */
  news2Scale: News2Scale | null;
}

export interface Admission {
  admissionId: string;
  mrn: string;
  admittedAt: Date;
  /**
   * Null while the patient is still in a bed here — including while they are
   * waiting for a critical care bed, which is a patient who has not left.
   */
  dischargedAt: Date | null;
  /** Null exactly when dischargedAt is null. The normaliser enforces that. */
  dischargeDestination: DischargeDestination | null;
  /** Null when no critical care bed was ever asked for. */
  criticalCareRequest: CriticalCareRequest | null;
  ward: string;
  admissionType: AdmissionType;
  sourceUnit: SourceUnit | null;
  diagnosis: string | null;
  firstAdmission: boolean;
}

/**
 * Consciousness as the ward charts it. Components are null for records
 * migrated from the hospital's previous system, which kept only the total —
 * those cannot be converted to ACVPU. See ADR 0004.
 */
export interface GlasgowComaScale {
  eye: number | null;
  verbal: number | null;
  motor: number | null;
  total: number;
}

export interface Observation {
  observationId: string;
  admissionId: string;
  recordedAt: Date;
  respirationRate: number | null;
  oxygenSaturation: number | null;
  respiratorySupport: RespiratorySupport;
  systolicBP: number | null;
  pulse: number | null;
  gcs: GlasgowComaScale;
  temperature: number | null;
  recordedBy: string | null;
}
