/**
 * What the hospital's SOAP service actually hands over, as delivered by the
 * node-soap client — not what the WSDL says in the abstract.
 *
 * These shapes were captured from the running simulator, and three of them
 * are not what anyone would guess:
 *
 *  - An empty field does not arrive as null. It arrives as the object
 *    { attributes: { 'xsi:nil': 'true' } }, which is truthy.
 *  - An empty list does not arrive as []. The wrapper arrives as null.
 *  - Integers arrive as numbers, because the client reads the WSDL types —
 *    but the temperature is declared as a string, so it arrives as '36,8'.
 */

export interface XsiNil {
  attributes: { 'xsi:nil': 'true' | string };
}

/** A value that may be present, explicitly nil, or missing altogether. */
export type Nillable<T> = T | XsiNil | null | undefined;

export interface LegacyPatient {
  mrn: string;
  nationalId: Nillable<string>;
  familyName: string;
  givenName: string;
  /** DD/MM/YYYY */
  birthDate: string;
  /** M | F | 1 | 2 | U */
  sexCode: string;
  /** '1' | '2' */
  news2Scale: Nillable<string>;
}

export interface LegacyAdmission {
  admissionId: string;
  mrn: string;
  /** DD/MM/YYYY HH:MM, Buenos Aires local time, no zone marker */
  admittedAt: string;
  dischargedAt: Nillable<string>;
  ward: string;
  /** URG | PROG */
  admissionType: string;
  /** GUARDIA | QUIROFANO | HEMODINAMIA | DERIVACION */
  sourceUnit: Nillable<string>;
  diagnosis: Nillable<string>;
  /** S | N */
  firstAdmission: string;
}

export interface LegacyObservation {
  observationId: string;
  admissionId: string;
  recordedAt: string;
  respirationRate: Nillable<number>;
  oxygenSaturation: Nillable<number>;
  /** AIRE | CANULA | MASCARA | CPAP | VNI */
  respSupport: string;
  systolicBP: Nillable<number>;
  pulse: Nillable<number>;
  gcsEye: Nillable<number>;
  gcsVerbal: Nillable<number>;
  gcsMotor: Nillable<number>;
  gcsTotal: Nillable<number>;
  /** Comma decimal: '36,8' */
  temperature: Nillable<string>;
  recordedBy: Nillable<string>;
}
