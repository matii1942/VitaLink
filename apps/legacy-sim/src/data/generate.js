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

/**
 * Entry point. The seed makes the dataset reproducible: same seed, same
 * patients, every time the simulator restarts and in every test run.
 */
function generateDataset({ patientCount = 25, seed = 42, now = startOfToday() } = {}) {
  faker.seed(seed);

  const patients = generatePatients(patientCount, now);
  const admissions = generateAdmissions(patients, now);

  return {
    patients,
    admissions,
    observations: [], // next step
  };
}

module.exports = {
  generateDataset,
  generatePatients,
  generateAdmissions,
  ageOn,
  startOfToday,
};
