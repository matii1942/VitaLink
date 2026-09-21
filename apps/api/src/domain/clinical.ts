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
  dischargedAt: Date | null;
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
