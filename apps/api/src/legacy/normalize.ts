/**
 * The legacy normaliser: turns what the hospital's SOAP service sends into
 * VitaLink's clean clinical model.
 *
 * It is the exact inverse of legacy-format.js in the simulator. Every quirk
 * that module adds, this one removes.
 *
 * Its rule for bad data is to refuse, loudly. A value that is absent becomes
 * null; a value that is present but malformed throws a NormalizationError
 * naming the field. The two must never be confused: treating a corrupt
 * temperature as a missing one would hide a data problem at the source and
 * produce a score from less information than the ward actually recorded.
 *
 * What this module does not do is judge clinical plausibility. A respiratory
 * rate of 34 is unusual, not malformed, and deciding what it means is the
 * NEWS2 engine's job. The only range checks here are the ones the contract
 * itself defines.
 */

import type {
  Admission,
  AdmissionType,
  CriticalCareRequest,
  CriticalCareUnit,
  DischargeDestination,
  GlasgowComaScale,
  News2Scale,
  Observation,
  Patient,
  RespiratorySupport,
  Sex,
  SourceUnit,
} from '../domain/clinical.js';
import type {
  LegacyAdmission,
  LegacyObservation,
  LegacyPatient,
  Nillable,
  XsiNil,
} from './legacy.types.js';

export class NormalizationError extends Error {
  constructor(
    readonly field: string,
    readonly value: unknown,
    reason: string,
  ) {
    super(`${field}: ${reason} (received ${JSON.stringify(value)})`);
    this.name = 'NormalizationError';
  }
}

// The hospital records local time with no zone. This is the assumption that
// turns its strings back into instants — the whole integration depends on it
// being right, so it lives in one place.
export const HOSPITAL_TIME_ZONE = 'America/Argentina/Buenos_Aires';

const localParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: HOSPITAL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const RESPIRATORY_SUPPORT: Record<string, RespiratorySupport> = {
  AIRE: 'room-air',
  CANULA: 'cannula',
  MASCARA: 'mask',
  CPAP: 'cpap',
  VNI: 'niv',
};

const SOURCE_UNIT: Record<string, SourceUnit> = {
  GUARDIA: 'emergency',
  QUIROFANO: 'theatre',
  HEMODINAMIA: 'cathlab',
  DERIVACION: 'transfer',
};

const ADMISSION_TYPE: Record<string, AdmissionType> = {
  URG: 'urgent',
  PROG: 'scheduled',
};

const CRITICAL_CARE_UNIT: Record<string, CriticalCareUnit> = {
  UTI: 'intensive-care',
  UCO: 'coronary-care',
};

// The hospital records a transfer to critical care with the same code as the
// unit itself, so this table is the one above plus going home.
const DISCHARGE_DESTINATION: Record<string, DischargeDestination> = {
  DOMICILIO: 'home',
  UTI: 'intensive-care',
  UCO: 'coronary-care',
};

// Two codings coexist after an unfinished migration. Both have to be read.
const SEX: Record<string, Sex> = {
  M: 'male',
  '1': 'male',
  F: 'female',
  '2': 'female',
  U: 'unknown',
};

// ---------------------------------------------------------------------------
// Absence
// ---------------------------------------------------------------------------

function isXsiNil(value: unknown): value is XsiNil {
  return (
    typeof value === 'object' &&
    value !== null &&
    'attributes' in value &&
    (value as XsiNil).attributes?.['xsi:nil'] === 'true'
  );
}

/**
 * Collapses every way the SOAP client can say "nothing here" — undefined,
 * null, or the xsi:nil object — into null. The xsi:nil object is the one
 * that causes bugs: it is truthy, so `if (value)` treats an empty field as
 * a present one.
 */
export function unwrap<T>(value: Nillable<T>): T | null {
  if (value === undefined || value === null || isXsiNil(value)) return null;
  return value as T;
}

/**
 * A repeated element arrives as an array, a single object, or — when there
 * are none — null. Callers always want an array.
 */
export function toList<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

// ---------------------------------------------------------------------------
// Scalars
// ---------------------------------------------------------------------------

function partsOf(date: Date): Record<string, string> {
  return Object.fromEntries(
    localParts.formatToParts(date).map((part) => [part.type, part.value]),
  );
}

/**
 * 'DD/MM/YYYY HH:MM' in hospital local time -> the instant it denotes.
 *
 * The string carries no zone, so the fields are first read as if they were
 * UTC; the difference between that and what the hospital's clock shows at
 * that instant is the offset to correct by.
 */
export function parseLegacyDateTime(field: string, raw: Nillable<string>): Date | null {
  const value = unwrap(raw);
  if (value === null) return null;

  const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) throw new NormalizationError(field, value, 'expected DD/MM/YYYY HH:MM');

  const [dd, mm, yyyy, hh, mi] = match.slice(1).map(Number);
  const asIfUtc = Date.UTC(yyyy, mm - 1, dd, hh, mi);
  if (Number.isNaN(asIfUtc) || new Date(asIfUtc).getUTCDate() !== dd) {
    throw new NormalizationError(field, value, 'not a real calendar date');
  }

  const shown = partsOf(new Date(asIfUtc));
  const shownAsUtc = Date.UTC(
    Number(shown.year),
    Number(shown.month) - 1,
    Number(shown.day),
    Number(shown.hour),
    Number(shown.minute),
  );

  return new Date(asIfUtc - (shownAsUtc - asIfUtc));
}

/**
 * 'DD/MM/YYYY' -> midnight UTC of that calendar date.
 *
 * A date of birth has no time and no zone; it is a day on a calendar. Holding
 * it at midnight UTC keeps it the same day wherever it is read.
 */
export function parseLegacyDate(field: string, raw: Nillable<string>): Date | null {
  const value = unwrap(raw);
  if (value === null) return null;

  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) throw new NormalizationError(field, value, 'expected DD/MM/YYYY');

  const [dd, mm, yyyy] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (date.getUTCDate() !== dd || date.getUTCMonth() !== mm - 1) {
    throw new NormalizationError(field, value, 'not a real calendar date');
  }
  return date;
}

/** 'S' -> true, 'N' -> false. Anything else is not a flag. */
export function parseLegacyFlag(field: string, raw: Nillable<string>): boolean {
  const value = unwrap(raw);
  if (value === 'S') return true;
  if (value === 'N') return false;
  throw new NormalizationError(field, raw, "expected 'S' or 'N'");
}

/**
 * '36,8' -> 36.8.
 *
 * This is the conversion the whole normaliser exists to get right.
 * parseFloat('36,8') returns 36 — no error, no warning, a fever of 38.9
 * quietly becomes 38. So the format is matched exactly, and a dot is
 * rejected rather than accepted: the contract says comma, and a source that
 * starts sending something else has changed in a way someone needs to know.
 */
export function parseLegacyTemperature(field: string, raw: Nillable<string>): number | null {
  const value = unwrap(raw);
  if (value === null) return null;

  if (!/^\d{2},\d$/.test(value.trim())) {
    throw new NormalizationError(field, value, "expected a comma decimal such as '36,8'");
  }
  return Number(value.trim().replace(',', '.'));
}

/** An integer field. The client usually delivers a number, but a string is tolerated. */
export function parseLegacyInt(field: string, raw: Nillable<number | string>): number | null {
  const value = unwrap(raw);
  if (value === null) return null;

  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(parsed)) {
    throw new NormalizationError(field, value, 'expected an integer');
  }
  return parsed;
}

function parseCode<T>(field: string, raw: Nillable<string>, table: Record<string, T>): T {
  const value = unwrap(raw);
  if (value === null || !(value in table)) {
    throw new NormalizationError(field, raw, `expected one of ${Object.keys(table).join(', ')}`);
  }
  return table[value];
}

function parseOptionalCode<T>(
  field: string,
  raw: Nillable<string>,
  table: Record<string, T>,
): T | null {
  return unwrap(raw) === null ? null : parseCode(field, raw, table);
}

function parseNews2Scale(raw: Nillable<string>): News2Scale | null {
  const value = unwrap(raw);
  if (value === null) return null;
  if (value === '1') return 1;
  if (value === '2') return 2;
  throw new NormalizationError('news2Scale', value, "expected '1' or '2'");
}

function required<T>(field: string, value: T | null): T {
  if (value === null) throw new NormalizationError(field, value, 'is required');
  return value;
}

/**
 * Enforces the Glasgow ranges the contract declares: eye 1-4, verbal 1-5,
 * motor 1-6, total 3-15. A total outside that range is not an unusual
 * patient, it is a corrupt record.
 */
function parseGlasgow(o: LegacyObservation): GlasgowComaScale {
  const eye = parseLegacyInt('gcsEye', o.gcsEye);
  const verbal = parseLegacyInt('gcsVerbal', o.gcsVerbal);
  const motor = parseLegacyInt('gcsMotor', o.gcsMotor);
  const total = required('gcsTotal', parseLegacyInt('gcsTotal', o.gcsTotal));

  const inRange = (field: string, value: number | null, min: number, max: number) => {
    if (value !== null && (value < min || value > max)) {
      throw new NormalizationError(field, value, `expected ${min}-${max}`);
    }
  };
  inRange('gcsEye', eye, 1, 4);
  inRange('gcsVerbal', verbal, 1, 5);
  inRange('gcsMotor', motor, 1, 6);
  inRange('gcsTotal', total, 3, 15);

  if (eye !== null && verbal !== null && motor !== null) {
    const sum = eye + verbal + motor;
    if (sum !== total) {
      throw new NormalizationError('gcsTotal', total, `components sum to ${sum}`);
    }
  } else if (eye !== null || verbal !== null || motor !== null) {
    // Either the record came across whole or it came across as a total only.
    // A partial set of components means something went wrong in between.
    throw new NormalizationError(
      'gcs',
      [eye, verbal, motor],
      'components must be all present or all absent',
    );
  }

  return { eye, verbal, motor, total };
}

// ---------------------------------------------------------------------------
// Whole records
// ---------------------------------------------------------------------------

export function normalizePatient(p: LegacyPatient): Patient {
  return {
    mrn: p.mrn,
    nationalId: unwrap(p.nationalId),
    familyName: p.familyName,
    givenName: p.givenName,
    birthDate: required('birthDate', parseLegacyDate('birthDate', p.birthDate)),
    sex: parseCode('sexCode', p.sexCode, SEX),
    news2Scale: parseNews2Scale(p.news2Scale),
  };
}

export function normalizeAdmission(a: LegacyAdmission): Admission {
  const dischargedAt = parseLegacyDateTime('dischargedAt', a.dischargedAt);
  const dischargeDestination = parseOptionalCode(
    'dischargeDestination',
    a.dischargeDestination,
    DISCHARGE_DESTINATION,
  );

  // Two fields, one fact, and they have to agree. A discharge with nowhere to
  // go, or a destination with no discharge, is a record the source contradicted
  // itself on — and either one puts a patient on the ward board who is not
  // there, or takes one off it who is.
  if ((dischargedAt === null) !== (dischargeDestination === null)) {
    throw new NormalizationError(
      'dischargeDestination',
      { dischargedAt: unwrap(a.dischargedAt), dischargeDestination: unwrap(a.dischargeDestination) },
      'must be present exactly when dischargedAt is',
    );
  }

  return {
    admissionId: a.admissionId,
    mrn: a.mrn,
    admittedAt: required('admittedAt', parseLegacyDateTime('admittedAt', a.admittedAt)),
    dischargedAt,
    dischargeDestination,
    criticalCareRequest: parseCriticalCareRequest(a),
    ward: a.ward,
    admissionType: parseCode('admissionType', a.admissionType, ADMISSION_TYPE),
    sourceUnit: parseOptionalCode('sourceUnit', a.sourceUnit, SOURCE_UNIT),
    diagnosis: unwrap(a.diagnosis),
    firstAdmission: parseLegacyFlag('firstAdmission', a.firstAdmission),
  };
}

/**
 * The critical care bed request: a unit and the moment it was asked for.
 *
 * Both fields or neither. Half a request is a corrupt record, not a partial
 * one: a unit with no time cannot be placed on a timeline, and a time with no
 * unit does not say where the patient was going.
 *
 * What this deliberately does not check is whether a patient discharged to
 * intensive care has a request on file. A hospital that transferred somebody
 * without charting the request produced incomplete data, not malformed data,
 * and refusing the admission would lose the transfer as well.
 */
function parseCriticalCareRequest(a: LegacyAdmission): CriticalCareRequest | null {
  const unit = parseOptionalCode('transferUnit', a.transferUnit, CRITICAL_CARE_UNIT);
  const requestedAt = parseLegacyDateTime('transferRequestedAt', a.transferRequestedAt);

  if (unit === null && requestedAt === null) return null;

  if (unit === null || requestedAt === null) {
    throw new NormalizationError(
      'transferUnit',
      { transferUnit: unwrap(a.transferUnit), transferRequestedAt: unwrap(a.transferRequestedAt) },
      'a bed request needs both a unit and a time, or neither',
    );
  }

  return { unit, requestedAt };
}

export function normalizeObservation(o: LegacyObservation): Observation {
  const oxygenSaturation = parseLegacyInt('oxygenSaturation', o.oxygenSaturation);
  if (oxygenSaturation !== null && (oxygenSaturation < 0 || oxygenSaturation > 100)) {
    throw new NormalizationError('oxygenSaturation', oxygenSaturation, 'expected 0-100');
  }

  return {
    observationId: o.observationId,
    admissionId: o.admissionId,
    recordedAt: required('recordedAt', parseLegacyDateTime('recordedAt', o.recordedAt)),
    respirationRate: parseLegacyInt('respirationRate', o.respirationRate),
    oxygenSaturation,
    respiratorySupport: parseCode('respSupport', o.respSupport, RESPIRATORY_SUPPORT),
    systolicBP: parseLegacyInt('systolicBP', o.systolicBP),
    pulse: parseLegacyInt('pulse', o.pulse),
    gcs: parseGlasgow(o),
    temperature: parseLegacyTemperature('temperature', o.temperature),
    recordedBy: unwrap(o.recordedBy),
  };
}
