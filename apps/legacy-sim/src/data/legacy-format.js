'use strict';

/**
 * Turns clean domain records into the shape the legacy hospital system emits.
 *
 * This is where every quirk declared in hospital.wsdl is actually applied:
 * dates as local-time strings with no zone, 'S'/'N' flags, comma decimals,
 * Spanish code values, and two sex codings living side by side.
 *
 * VitaLink's normaliser (Sprint 2) is the exact inverse of this module.
 * Normalising what this produces has to give back the original record —
 * which is also the most useful test either side will have.
 */

// The hospital charts in Buenos Aires local time and never records the zone.
// Argentina has not observed daylight saving since 2009, so this is UTC-3
// all year — but the zone name is used rather than a hard-coded offset,
// because a hard-coded offset is exactly how these bugs get written.
const HOSPITAL_TIME_ZONE = 'America/Argentina/Buenos_Aires';

const localParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: HOSPITAL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23', // some engines render midnight as "24:00" without this
});

const RESP_SUPPORT = {
  'room-air': 'AIRE',
  cannula: 'CANULA',
  mask: 'MASCARA',
  cpap: 'CPAP',
  niv: 'VNI',
};

const SOURCE_UNIT = {
  emergency: 'GUARDIA',
  theatre: 'QUIROFANO',
  cathlab: 'HEMODINAMIA',
  transfer: 'DERIVACION',
};

const ADMISSION_TYPE = {
  urgent: 'URG',
  scheduled: 'PROG',
};

// ---------------------------------------------------------------------------
// Scalar conversions
// ---------------------------------------------------------------------------

function partsOf(date) {
  return Object.fromEntries(
    localParts.formatToParts(date).map((part) => [part.type, part.value]),
  );
}

/** Date -> '20/09/2026' in hospital local time. */
function toLegacyDate(date) {
  if (date === null || date === undefined) return null;
  const p = partsOf(date);
  return `${p.day}/${p.month}/${p.year}`;
}

/** Date -> '20/09/2026 14:30' in hospital local time, no zone marker. */
function toLegacyDateTime(date) {
  if (date === null || date === undefined) return null;
  const p = partsOf(date);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/**
 * '20/09/2026 14:30' -> Date, reading the string as hospital local time.
 *
 * The server needs this for the optional `since` argument of
 * GetObservations. It is a preview of the Sprint 2 normaliser: the string
 * carries no zone, so the only way back to an instant is to assume one.
 */
function fromLegacyDateTime(text) {
  if (text === null || text === undefined || text === '') return null;

  const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(String(text).trim());
  if (!match) return null;

  const [, dd, mm, yyyy, hh, mi] = match.map(Number);

  // Treat the fields as if they were UTC, see what local time that instant
  // shows in the hospital zone, and correct by the difference.
  const asIfUtc = Date.UTC(yyyy, mm - 1, dd, hh, mi);
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

/** true -> 'S', false -> 'N'. Null stays null: absent is not the same as no. */
function toLegacyFlag(value) {
  if (value === null || value === undefined) return null;
  return value ? 'S' : 'N';
}

/**
 * 36.8 -> '36,8'. One decimal, comma separator.
 *
 * This is the quirk most likely to hurt on the way back in: parseFloat('36,8')
 * returns 36, silently, with no error.
 */
function toLegacyTemp(value) {
  if (value === null || value === undefined) return null;
  return value.toFixed(1).replace('.', ',');
}

/**
 * The hospital migrated systems and never normalised the old records, so two
 * sex codings coexist: 'M'/'F' in current records, '1'/'2' in records carried
 * over from the previous system.
 *
 * Which coding a patient gets has to be stable — the same patient returning
 * 'F' on one call and '2' on the next would not be a legacy system, it would
 * be a broken one. Rather than keep state, the coding is derived from the
 * medical record number, which never changes: about three in ten records
 * behave as if they were created in the old system.
 */
function toLegacySexCode(sex, mrn) {
  if (sex === 'unknown' || sex === null || sex === undefined) return 'U';

  const serial = Number(String(mrn).replace(/\D/g, ''));
  const carriedOver = serial % 10 < 3;

  if (sex === 'male') return carriedOver ? '1' : 'M';
  return carriedOver ? '2' : 'F';
}

function lookup(table, value) {
  if (value === null || value === undefined) return null;
  if (!(value in table)) {
    throw new Error(`No legacy code for "${value}"`);
  }
  return table[value];
}

// ---------------------------------------------------------------------------
// Whole records
// ---------------------------------------------------------------------------

function toLegacyPatient(patient) {
  return {
    mrn: patient.mrn,
    nationalId: patient.nationalId,
    familyName: patient.familyName,
    givenName: patient.givenName,
    birthDate: toLegacyDate(patient.birthDate),
    sexCode: toLegacySexCode(patient.sex, patient.mrn),
    news2Scale: patient.news2Scale === null ? null : String(patient.news2Scale),
  };
}

function toLegacyAdmission(admission) {
  return {
    admissionId: admission.admissionId,
    mrn: admission.mrn,
    admittedAt: toLegacyDateTime(admission.admittedAt),
    dischargedAt: toLegacyDateTime(admission.dischargedAt),
    ward: admission.ward,
    admissionType: lookup(ADMISSION_TYPE, admission.admissionType),
    sourceUnit: lookup(SOURCE_UNIT, admission.sourceUnit),
    diagnosis: admission.diagnosis,
    firstAdmission: toLegacyFlag(admission.firstAdmission),
  };
}

function toLegacyObservation(observation) {
  return {
    observationId: observation.observationId,
    admissionId: observation.admissionId,
    recordedAt: toLegacyDateTime(observation.recordedAt),
    respirationRate: observation.respirationRate,
    oxygenSaturation: observation.oxygenSaturation,
    respSupport: lookup(RESP_SUPPORT, observation.respSupport),
    systolicBP: observation.systolicBP,
    pulse: observation.pulse,
    gcsEye: observation.gcsEye,
    gcsVerbal: observation.gcsVerbal,
    gcsMotor: observation.gcsMotor,
    gcsTotal: observation.gcsTotal,
    temperature: toLegacyTemp(observation.temperature),
    recordedBy: observation.recordedBy,
  };
}

module.exports = {
  HOSPITAL_TIME_ZONE,
  toLegacyDate,
  toLegacyDateTime,
  fromLegacyDateTime,
  toLegacyFlag,
  toLegacyTemp,
  toLegacySexCode,
  toLegacyPatient,
  toLegacyAdmission,
  toLegacyObservation,
};
