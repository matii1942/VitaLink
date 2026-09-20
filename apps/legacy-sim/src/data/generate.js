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

/**
 * Entry point. The seed makes the dataset reproducible: same seed, same
 * patients, every time the simulator restarts and in every test run.
 */
function generateDataset({ patientCount = 25, seed = 42, now = startOfToday() } = {}) {
  faker.seed(seed);

  const patients = generatePatients(patientCount, now);

  return {
    patients,
    admissions: [], // next step
    observations: [], // after that
  };
}

module.exports = { generateDataset, generatePatients, ageOn, startOfToday };
