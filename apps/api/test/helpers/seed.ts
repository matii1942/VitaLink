/**
 * Row builders for the tests.
 *
 * Each one writes a valid row with sensible defaults and lets the test override
 * only the fields it is actually about. A test about a patient too young to be
 * scored says `{ birthDate: ... }` and nothing else; everything that makes the
 * row valid but is beside the point stays out of the test.
 *
 * The defaults describe a stable adult on room air: every NEWS2 parameter in
 * its zero-scoring band. A test that wants an abnormal value states it, which
 * means the interesting number is always visible in the test itself.
 */
import type {
  Admission,
  Observation,
  Patient,
  Prisma,
  Score,
} from '../../src/generated/prisma/client.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import { NEWS2_ENGINE_VERSION } from '../../src/news2/news2.js';

/**
 * Makes identifiers unique within a run without random values, so a failure
 * message always shows the same identifiers for the same sequence of calls.
 */
let sequence = 0;
function next(): string {
  sequence += 1;
  return String(sequence).padStart(4, '0');
}

/** Resets the identifier counter. TestApp.reset() calls it after truncating. */
export function resetSequence(): void {
  sequence = 0;
}

export async function seedPatient(
  prisma: PrismaService,
  overrides: Partial<Prisma.PatientUncheckedCreateInput> = {},
): Promise<Patient> {
  const n = next();

  return prisma.patient.create({
    data: {
      mrn: `MRN-${n}`,
      nationalId: `30${n}0000`,
      familyName: 'Gomez',
      givenName: `Paciente ${n}`,
      birthDate: new Date('1970-05-12T00:00:00.000Z'),
      sex: 'female',
      news2Scale: 1,
      ...overrides,
    },
  });
}

export async function seedAdmission(
  prisma: PrismaService,
  overrides: Partial<Prisma.AdmissionUncheckedCreateInput> & { mrn: string },
): Promise<Admission> {
  const n = next();
  const dischargedAt = overrides.dischargedAt ?? null;

  return prisma.admission.create({
    data: {
      admissionId: `ADM-${n}`,
      admittedAt: new Date('2026-09-01T10:00:00.000Z'),
      dischargedAt: null,
      ward: 'internal-medicine',
      admissionType: 'urgent',
      sourceUnit: 'emergency',
      diagnosis: 'Neumonia adquirida en la comunidad',
      firstAdmission: true,
      ...overrides,
      // Discharged and destination go together — the normaliser refuses a
      // record where they disagree, so a seed must not build one. A test that
      // cares which destination says so; the rest get the ordinary one.
      dischargeDestination:
        overrides.dischargeDestination ?? (dischargedAt === null ? null : 'home'),
    },
  });
}

export async function seedObservation(
  prisma: PrismaService,
  overrides: Partial<Prisma.ObservationUncheckedCreateInput> & { admissionId: string },
): Promise<Observation> {
  const n = next();

  return prisma.observation.create({
    data: {
      observationId: `OBS-${n}`,
      recordedAt: new Date('2026-09-01T12:00:00.000Z'),
      respirationRate: 16,
      oxygenSaturation: 97,
      respiratorySupport: 'room-air',
      systolicBP: 120,
      pulse: 72,
      gcsEye: 4,
      gcsVerbal: 5,
      gcsMotor: 6,
      gcsTotal: 15,
      temperature: 36.8,
      recordedBy: 'ENF-0001',
      ...overrides,
    },
  });
}

export async function seedScore(
  prisma: PrismaService,
  overrides: Partial<Prisma.ScoreUncheckedCreateInput> & { observationId: string },
): Promise<Score> {
  return prisma.score.create({
    data: {
      status: 'scored',
      aggregate: 0,
      risk: 'low',
      partial: false,
      redScore: false,
      scaleUsed: 1,
      scaleSource: 'recorded',
      respirationRateScore: 0,
      oxygenSaturationScore: 0,
      supplementalOxygenScore: 0,
      systolicBPScore: 0,
      pulseScore: 0,
      consciousnessScore: 0,
      temperatureScore: 0,
      missing: [],
      engineVersion: NEWS2_ENGINE_VERSION,
      ...overrides,
    },
  });
}

/**
 * One patient, one open admission, one observation and its score — the
 * smallest complete chain, which is what most endpoint tests need.
 */
export async function seedAdmittedPatient(
  prisma: PrismaService,
  overrides: {
    patient?: Partial<Prisma.PatientUncheckedCreateInput>;
    admission?: Partial<Prisma.AdmissionUncheckedCreateInput>;
    observation?: Partial<Prisma.ObservationUncheckedCreateInput>;
    score?: Partial<Prisma.ScoreUncheckedCreateInput>;
  } = {},
): Promise<{ mrn: string; admissionId: string; observationId: string }> {
  const patient = await seedPatient(prisma, overrides.patient);
  const admission = await seedAdmission(prisma, { mrn: patient.mrn, ...overrides.admission });
  const observation = await seedObservation(prisma, {
    admissionId: admission.admissionId,
    ...overrides.observation,
  });
  await seedScore(prisma, { observationId: observation.observationId, ...overrides.score });

  return {
    mrn: patient.mrn,
    admissionId: admission.admissionId,
    observationId: observation.observationId,
  };
}
