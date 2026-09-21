'use strict';

/**
 * Synthetic dataset generator for the hospital simulator.
 *
 * Everything produced here is CLEAN domain data: real Date objects, real
 * numbers, real booleans, English enum values. The legacy quirks that the
 * SOAP contract describes — string dates, 'S'/'N' flags, comma decimals,
 * Spanish codes — are applied later, in legacy-format.js, at the moment a
 * response is serialised.
 *
 * Keeping the two apart means the clinical logic can do arithmetic (a
 * saturation that falls over six hours is a subtraction, not a string edit)
 * and the tests can assert on numbers instead of on formatting.
 *
 * NO REAL PATIENT DATA. Every value here is invented.
 */

// fakerES is the Spanish locale. (fakerAR is Arabic, not Argentinian —
// there is no es_AR locale, so Spanish names are the closest fit.)
const { fakerES: faker } = require('@faker-js/faker');

// A NEWS2 Scale 2 patient has chronic hypercapnic respiratory failure —
// in practice, usually long-standing COPD. It is a clinical decision
// recorded against the patient, never something the software infers.
const SCALE_2_SHARE = 0.15;
const SCALE_2_MIN_AGE = 55;

/**
 * Builds `count` patients.
 *
 * @param {number} count
 * @returns {Array<object>} clean patient records
 */
function generatePatients(count, now) {
  const patients = [];

  for (let i = 0; i < count; i += 1) {
    const birthDate = pickBirthDate(now);
    const age = ageOn(birthDate, now);
    const sex = faker.helpers.weightedArrayElement([
      { value: 'female', weight: 50 },
      { value: 'male', weight: 48 },
      { value: 'unknown', weight: 2 },
    ]);

    patients.push({
      // Medical record numbers are handed out in sequence, not at random.
      mrn: `MRN-${String(i + 1).padStart(6, '0')}`,

      // A few records predate the electronic system and never got a DNI.
      nationalId: faker.datatype.boolean({ probability: 0.97 })
        ? nationalIdFor(birthDate)
        : null,

      familyName: faker.person.lastName().toUpperCase(),
      givenName: faker.person.firstName(sex === 'unknown' ? undefined : sex),
      birthDate,
      sex,

      news2Scale:
        age >= SCALE_2_MIN_AGE &&
        faker.datatype.boolean({ probability: SCALE_2_SHARE })
          ? 2
          : 1,
    });
  }

  return patients;
}

/**
 * Ward populations skew old. A general medical ward is mostly people over
 * 65; younger admissions exist but are the minority.
 */
function pickBirthDate(now) {
  const band = faker.helpers.weightedArrayElement([
    { value: [65, 95], weight: 60 },
    { value: [40, 64], weight: 30 },
    { value: [18, 39], weight: 10 },
  ]);

  // refDate has to be passed explicitly. Left to default, Faker anchors the
  // age on the exact current instant, so two calls milliseconds apart produce
  // different birth dates and the dataset stops being reproducible.
  return faker.date.birthdate({
    min: band[0],
    max: band[1],
    mode: 'age',
    refDate: now,
  });
}

/**
 * Argentinian DNI numbers were issued in rough chronological order, so an
 * older patient carries a lower number. Not exact — it only has to look
 * plausible to someone who has seen real ones.
 */
function nationalIdFor(birthDate) {
  const birthYear = birthDate.getFullYear();
  const base = Math.round((birthYear - 1930) * 560000 + 3000000);
  const jitter = faker.number.int({ min: -400000, max: 400000 });

  return String(Math.max(1000000, base + jitter)).padStart(8, '0');
}

/** Midnight UTC today: stable for the whole day, so restarts agree. */
function startOfToday() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function ageOn(birthDate, reference) {
  let age = reference.getFullYear() - birthDate.getFullYear();
  const monthDelta = reference.getMonth() - birthDate.getMonth();

  if (monthDelta < 0 || (monthDelta === 0 && reference.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return age;
}

// ---------------------------------------------------------------------------
// Admissions
// ---------------------------------------------------------------------------

// Where a patient ends up shapes everything else about their admission, so
// the ward is drawn first and the rest follows from it.
const WARDS = [
  { value: 'internal-medicine', weight: 45 },
  { value: 'surgery', weight: 30 },
  { value: 'cardiology', weight: 25 },
];

// Urgency is not a property of hospitals in general, it is a property of
// wards. Surgery fills mostly from a waiting list; internal medicine fills
// mostly from the front door.
const URGENCY_BY_WARD = {
  'internal-medicine': [
    { value: 'urgent', weight: 75 },
    { value: 'scheduled', weight: 25 },
  ],
  surgery: [
    { value: 'urgent', weight: 25 },
    { value: 'scheduled', weight: 75 },
  ],
  cardiology: [
    { value: 'urgent', weight: 55 },
    { value: 'scheduled', weight: 45 },
  ],
};

// Free text written by a clinician at the bedside, so it is in Spanish.
//
// Split by admission type, because a diagnosis is not independent of how the
// patient arrived. An elective procedure cannot be the reason someone came
// through the emergency department, and an acute abdomen is not something a
// waiting list schedules. Drawing from one pool per ward produced admissions
// that read as nonsense to anyone who has worked a ward.
const DIAGNOSES = {
  'internal-medicine': {
    urgent: [
      'Neumonia adquirida en la comunidad',
      'Insuficiencia cardiaca descompensada',
      'Infeccion urinaria alta',
      'Celulitis de miembro inferior',
      'Descompensacion diabetica',
    ],
    scheduled: [
      'Estudio de anemia programado',
      'Ajuste de tratamiento anticoagulante',
      'Transfusion programada',
    ],
  },
  surgery: {
    urgent: [
      'Apendicitis aguda',
      'Colecistitis aguda',
      'Hernia inguinal complicada',
      'Obstruccion intestinal',
    ],
    scheduled: [
      'Colecistectomia laparoscopica programada',
      'Hernioplastia inguinal programada',
      'Eventracion de pared abdominal',
    ],
  },
  cardiology: {
    urgent: [
      'Sindrome coronario agudo',
      'Fibrilacion auricular de reciente comienzo',
      'Insuficiencia cardiaca descompensada',
    ],
    scheduled: [
      'Angioplastia coronaria programada',
      'Estudio electrofisiologico programado',
      'Implante de marcapasos programado',
    ],
  },
};

// A Scale 2 patient has advanced COPD. They arrive on a medical ward with a
// respiratory problem, not for elective gallbladder surgery. Drawing their
// ward and diagnosis from the general pool would produce records that are
// each individually plausible and collectively absurd.
const COPD_DIAGNOSES = [
  'EPOC reagudizado',
  'EPOC reagudizado con infeccion respiratoria',
  'Insuficiencia respiratoria cronica reagudizada',
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DISCHARGED_SHARE = 0.3;

/**
 * Builds one admission per patient.
 *
 * @param {Array<object>} patients
 * @param {Date} now  reference instant; nothing here reads the clock
 * @returns {Array<object>} clean admission records
 */
function generateAdmissions(patients, now) {
  return patients.map((patient, i) => {
    const isCopd = patient.news2Scale === 2;

    const ward = isCopd
      ? 'internal-medicine'
      : faker.helpers.weightedArrayElement(WARDS);

    const admissionType = isCopd
      ? 'urgent'
      : faker.helpers.weightedArrayElement(URGENCY_BY_WARD[ward]);

    const admittedAt = faker.date.between({
      from: new Date(now.getTime() - 10 * MS_PER_DAY),
      to: new Date(now.getTime() - 1 * MS_PER_DAY),
    });

    return {
      admissionId: `ADM-${String(i + 1).padStart(6, '0')}`,
      mrn: patient.mrn,
      admittedAt,
      dischargedAt: pickDischarge(admittedAt, now),
      ward,
      admissionType,
      sourceUnit: pickSourceUnit(ward, admissionType),
      diagnosis: isCopd
        ? faker.helpers.arrayElement(COPD_DIAGNOSES)
        : faker.helpers.arrayElement(DIAGNOSES[ward][admissionType]),

      // Advanced COPD means a history of admissions. A first admission
      // would contradict the diagnosis.
      firstAdmission: isCopd
        ? false
        : faker.datatype.boolean({ probability: 0.55 }),
    };
  });
}

/**
 * Where the patient came from. This cannot be drawn independently of the
 * admission type: a scheduled admission walks in from home and has no source
 * unit at all, while an urgent one always came from somewhere.
 */
function pickSourceUnit(ward, admissionType) {
  if (admissionType === 'urgent') {
    return faker.helpers.weightedArrayElement([
      { value: 'emergency', weight: 85 },
      { value: 'transfer', weight: 15 },
    ]);
  }

  // Scheduled: only the procedural wards have an upstream unit.
  if (ward === 'surgery') return 'theatre';
  if (ward === 'cardiology') {
    return faker.helpers.weightedArrayElement([
      { value: 'cathlab', weight: 60 },
      { value: null, weight: 40 },
    ]);
  }

  return null; // admitted from home
}

/**
 * Around 30% of the ward has already gone home; the rest are still in a bed,
 * and those are the ones ListAdmissions(activeOnly) has to return.
 *
 * The discharge is drawn from the interval that starts one day after
 * admission and ends now, which is the only way to guarantee it never
 * lands before the admission it belongs to.
 */
function pickDischarge(admittedAt, now) {
  if (!faker.datatype.boolean({ probability: DISCHARGED_SHARE })) return null;

  const earliest = new Date(admittedAt.getTime() + MS_PER_DAY);
  if (earliest >= now) return null; // admitted too recently to be home yet

  return faker.date.between({ from: earliest, to: now });
}

// ---------------------------------------------------------------------------
// Observations
// ---------------------------------------------------------------------------

const MS_PER_HOUR = 60 * 60 * 1000;
const ROUND_INTERVAL_HOURS = 6;

// Most people on a ward are simply getting better or holding steady. The
// deteriorating minority is the entire reason an early warning score exists,
// so the dataset has to contain some — but making them common would produce
// a ward nobody would recognise.
const TRAJECTORIES = [
  { value: 'stable', weight: 65 },
  { value: 'improving', weight: 25 },
  { value: 'deteriorating', weight: 10 },
];

// How far each vital sign moves between a well patient and a severely
// unwell one. Signs do not drift independently: a patient who is going off
// gets tachypnoeic, hypoxic, tachycardic, hypotensive and febrile together,
// which is precisely why an aggregate score detects what a single number
// misses.
const SEVERE_DELTA = {
  respirationRate: +12,
  oxygenSaturation: -9,
  systolicBP: -28,
  pulse: +34,
  temperature: +1.7,
};

// Physiologically possible bounds. Values are clamped rather than allowed to
// run off, because a respiratory rate of 45 in a ward patient is not a
// severity signal, it is a data entry error.
const LIMITS = {
  respirationRate: [8, 36],
  oxygenSaturation: [80, 100],
  systolicBP: [70, 190],
  pulse: [40, 150],
  temperature: [34.5, 40.5],
};

// Different parameters go missing at different rates. Saturation and pulse
// come off a monitor and are almost always there; a temperature needs
// someone to fetch a thermometer.
const MISSING_RATE = {
  respirationRate: 0.07,
  oxygenSaturation: 0.02,
  systolicBP: 0.05,
  pulse: 0.02,
  temperature: 0.11,
};

// The hospital migrated to its current system a week ago. Observations
// charted before the cutover were carried across as a Glasgow total only,
// with the components lost. Those are the records that cannot be converted
// to ACVPU — see ADR 0004.
const MIGRATION_CUTOVER_DAYS = 7;

const NURSES = [
  'ENF. GOMEZ',
  'ENF. QUIROGA',
  'ENF. BENITEZ',
  'ENF. ACUÑA',
  'ENF. SOSA',
  'ENF. LEDESMA',
];

/**
 * Builds the observation timeline for every admission.
 *
 * @param {Array<object>} admissions
 * @param {Array<object>} patients
 * @param {Date} now
 * @returns {Array<object>} clean observation records
 */
function generateObservations(admissions, patients, now) {
  const byMrn = new Map(patients.map((p) => [p.mrn, p]));
  const cutover = new Date(now.getTime() - MIGRATION_CUTOVER_DAYS * MS_PER_DAY);
  const observations = [];

  for (const admission of admissions) {
    const patient = byMrn.get(admission.mrn);
    const trajectory = faker.helpers.weightedArrayElement(TRAJECTORIES);
    const baseline = baselineFor(patient);
    let respSupport = null; // carried from one round to the next

    const from = admission.admittedAt;
    const to = admission.dischargedAt ?? now;
    const spanMs = to.getTime() - from.getTime();
    const rounds = Math.floor(spanMs / (ROUND_INTERVAL_HOURS * MS_PER_HOUR));

    for (let r = 0; r <= rounds; r += 1) {
      // Rounds are nominally every six hours. Nobody charts on the minute,
      // so each one lands within about half an hour of its slot.
      const nominal = from.getTime() + r * ROUND_INTERVAL_HOURS * MS_PER_HOUR;
      const jitter = faker.number.int({ min: -25, max: 25 }) * 60 * 1000;
      const recordedAt = new Date(Math.min(nominal + jitter, to.getTime()));

      if (recordedAt < from) continue;

      const progress = rounds === 0 ? 1 : r / rounds;
      const severity = severityAt(trajectory, progress);

      respSupport = nextRespSupport(patient, severity, respSupport);

      observations.push(
        buildObservation({
          index: observations.length,
          admission,
          patient,
          recordedAt,
          baseline,
          severity,
          respSupport,
          beforeCutover: recordedAt < cutover,
        }),
      );
    }
  }

  return observations;
}

/**
 * Where this patient sits when they are well.
 *
 * A Scale 2 patient lives at a saturation that would be an alarm in anyone
 * else. That is the whole point of the second scale, and if the generator
 * gave them 97% the scale would never be exercised.
 */
function baselineFor(patient) {
  const scale2 = patient.news2Scale === 2;

  return {
    respirationRate: faker.number.int(scale2 ? { min: 18, max: 22 } : { min: 13, max: 18 }),
    oxygenSaturation: faker.number.int(scale2 ? { min: 88, max: 92 } : { min: 95, max: 99 }),
    systolicBP: faker.number.int({ min: 112, max: 142 }),
    pulse: faker.number.int({ min: 62, max: 88 }),
    temperature: faker.number.float({ min: 36.1, max: 36.9, fractionDigits: 1 }),
  };
}

/**
 * How unwell the patient is at this point in the stay, from 0 to 1.
 *
 * Deterioration accelerates rather than running in a straight line: the
 * patient looks nearly fine for most of the stay and then goes off quickly.
 * That shape is what makes the trend hard to spot by eye across shift
 * changes, and it is exactly what the score is meant to catch.
 */
function severityAt(trajectory, progress) {
  const noise = faker.number.float({ min: -0.04, max: 0.04, fractionDigits: 3 });

  if (trajectory === 'deteriorating') return clamp(progress ** 1.8 + noise, 0, 1);
  if (trajectory === 'improving') return clamp(0.45 * (1 - progress) + noise, 0, 1);

  return clamp(0.08 + noise, 0, 1);
}

function buildObservation({
  index,
  admission,
  recordedAt,
  baseline,
  severity,
  respSupport,
  beforeCutover,
}) {
  const gcs = glasgowFor(severity, beforeCutover);

  return {
    observationId: `OBS-${String(index + 1).padStart(7, '0')}`,
    admissionId: admission.admissionId,
    recordedAt,

    respirationRate: maybeMissing('respirationRate', vital('respirationRate', baseline, severity, 1.2)),
    oxygenSaturation: maybeMissing('oxygenSaturation', vital('oxygenSaturation', baseline, severity, 1)),
    respSupport,
    systolicBP: maybeMissing('systolicBP', vital('systolicBP', baseline, severity, 6)),
    pulse: maybeMissing('pulse', vital('pulse', baseline, severity, 4)),

    gcsEye: gcs.eye,
    gcsVerbal: gcs.verbal,
    gcsMotor: gcs.motor,
    gcsTotal: gcs.total,

    temperature: maybeMissing('temperature', vital('temperature', baseline, severity, 0.2, 1)),
    recordedBy: faker.helpers.arrayElement(NURSES),
  };
}

/** baseline + (severity x full swing) + measurement noise, then clamped. */
function vital(name, baseline, severity, noiseSpread, fractionDigits = 0) {
  const raw =
    baseline[name] +
    SEVERE_DELTA[name] * severity +
    faker.number.float({ min: -noiseSpread, max: noiseSpread, fractionDigits: 2 });

  const [min, max] = LIMITS[name];
  const clamped = clamp(raw, min, max);

  return fractionDigits === 0
    ? Math.round(clamped)
    : Number(clamped.toFixed(fractionDigits));
}

function maybeMissing(name, value) {
  return faker.datatype.boolean({ probability: MISSING_RATE[name] }) ? null : value;
}

// Oxygen delivery, from least to most support. The order is what makes
// "one step" mean something.
const RESP_SUPPORT_LADDER = ['room-air', 'cannula', 'mask', 'cpap', 'niv'];

// Coming back down is a clinical decision someone has to make and review,
// so it happens rarely and never by more than one rung at a time.
const DE_ESCALATION_CHANCE = 0.2;

/**
 * Where this patient's oxygen ought to sit given how unwell they are.
 * A Scale 2 patient usually sits on a cannula even when well, so they have
 * a floor.
 */
function targetSupportLevel(patient, severity) {
  const floor = patient.news2Scale === 2 ? 1 : 0;

  let level = 0;
  if (severity > 0.95) level = 4;
  else if (severity > 0.85) level = 3;
  else if (severity > 0.65) level = 2;
  else if (severity > 0.4) level = 1;

  return Math.max(level, floor);
}

/**
 * Oxygen support carries over from the previous round instead of being drawn
 * fresh each time.
 *
 * Without this, a patient could be on non-invasive ventilation at 06:00, a
 * nasal cannula at 12:00 and a mask at 18:00 — each value plausible on its
 * own, the sequence impossible. Escalation happens one rung at a time, and
 * weaning back down is slow.
 *
 * @param {object} patient
 * @param {number} severity
 * @param {string|null} previous  support at the previous round, null on the first
 */
function nextRespSupport(patient, severity, previous) {
  const target = targetSupportLevel(patient, severity);

  if (previous === null) return RESP_SUPPORT_LADDER[target];

  const current = RESP_SUPPORT_LADDER.indexOf(previous);

  if (current < target) return RESP_SUPPORT_LADDER[current + 1];

  if (current > target && faker.datatype.boolean({ probability: DE_ESCALATION_CHANCE })) {
    return RESP_SUPPORT_LADDER[current - 1];
  }

  return previous;
}

/**
 * Consciousness is charted as a Glasgow. Ward patients are almost all fully
 * alert; confusion appears late, when someone is genuinely going off.
 *
 * Records predating the system migration carry only the total.
 */
function glasgowFor(severity, beforeCutover) {
  let eye = 4;
  let verbal = 5;
  let motor = 6;

  if (severity > 0.7 && faker.datatype.boolean({ probability: 0.45 })) {
    verbal = 4; // confused
    if (severity > 0.9 && faker.datatype.boolean({ probability: 0.3 })) {
      eye = 3; // opens to voice
    }
  }

  const total = eye + verbal + motor;

  return beforeCutover
    ? { eye: null, verbal: null, motor: null, total }
    : { eye, verbal, motor, total };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Entry point. The seed makes the dataset reproducible: same seed, same
 * patients, every time the simulator restarts and in every test run.
 */
function generateDataset({ patientCount = 25, seed = 42, now = startOfToday() } = {}) {
  faker.seed(seed);

  const patients = generatePatients(patientCount, now);
  const admissions = generateAdmissions(patients, now);
  const observations = generateObservations(admissions, patients, now);

  return { patients, admissions, observations };
}

module.exports = {
  generateDataset,
  generatePatients,
  generateAdmissions,
  generateObservations,
  ageOn,
  startOfToday,
};
