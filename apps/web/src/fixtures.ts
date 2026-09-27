/**
 * Row builders for the component tests, mirroring the ones the API's own
 * tests use: every builder writes a complete, valid object and lets a test
 * override only the field it is actually about.
 *
 * The defaults describe a stable adult scoring zero. A test about a
 * deteriorating patient says so in one line, which keeps the interesting
 * number visible inside the test rather than buried in a fixture file.
 */
import type {
  AdmissionWithPatient,
  ObservationView,
  ScoreView,
  SummaryView,
  WardBoard,
  WardBoardRow,
} from './types';

let sequence = 0;

export function resetFixtures(): void {
  sequence = 0;
}

function next(): string {
  sequence += 1;
  return String(sequence).padStart(4, '0');
}

export function score(over: Partial<ScoreView> = {}): ScoreView {
  return {
    status: 'scored',
    notEligibleReason: null,
    aggregate: 0,
    risk: 'low',
    partial: false,
    redScore: false,
    scaleUsed: 1,
    scaleSource: 'recorded',
    parameters: null,
    missing: [],
    engineVersion: 'news2-2017.1',
    computedAt: '2026-09-27T09:00:00.000Z',
    ...over,
  };
}

export function observation(over: Partial<ObservationView> = {}): ObservationView {
  const n = next();

  return {
    observationId: `OBS-${n}`,
    admissionId: 'ADM-0001',
    recordedAt: '2026-09-27T08:00:00.000Z',
    respirationRate: 16,
    oxygenSaturation: 97,
    respiratorySupport: 'room-air',
    systolicBP: 120,
    pulse: 72,
    glasgow: { eye: 4, verbal: 5, motor: 6, total: 15 },
    temperature: 36.8,
    recordedBy: 'ENF-0001',
    score: score(),
    ...over,
  };
}

export function admission(over: Partial<AdmissionWithPatient> = {}): AdmissionWithPatient {
  const n = next();

  return {
    admissionId: `ADM-${n}`,
    mrn: `MRN-${n}`,
    admittedAt: '2026-09-25T10:00:00.000Z',
    dischargedAt: null,
    active: true,
    awaitingCriticalCare: false,
    criticalCareRequest: null,
    dischargeDestination: null,
    ward: 'internal-medicine',
    admissionType: 'urgent',
    sourceUnit: 'emergency',
    diagnosis: 'Neumonia adquirida en la comunidad',
    firstAdmission: true,
    observationCount: 3,
    patient: {
      mrn: `MRN-${n}`,
      familyName: 'Gomez',
      givenName: `Paciente ${n}`,
      birthDate: '1970-05-12',
      age: 56,
      sex: 'female',
      news2Scale: 1,
    },
    ...over,
  };
}

export function boardRow(over: Partial<WardBoardRow> = {}): WardBoardRow {
  const base = admission();

  return {
    ...base,
    latestObservation: observation({ admissionId: base.admissionId }),
    ...over,
  };
}

export function board(rows: WardBoardRow[], over: Partial<WardBoard> = {}): WardBoard {
  return {
    ward: 'internal-medicine',
    generatedAt: '2026-09-27T09:00:00.000Z',
    openAdmissions: rows.length,
    orderedBy: 'waiting for a critical care bed, then risk',
    rows,
    ...over,
  };
}

export function summary(over: Partial<SummaryView> = {}): SummaryView {
  return {
    admissionId: 'ADM-0001',
    text: 'The patient is stable on room air.',
    state: 'current',
    reason: null,
    generatedAt: '2026-09-27T09:00:00.000Z',
    throughRecordedAt: '2026-09-27T08:00:00.000Z',
    roundsUsed: 3,
    model: 'claude-haiku-4-5',
    promptVersion: 'handover-1',
    disclaimer: 'Generated from the observations recorded for this admission. Derived text, not a clinical record.',
    budget: { spentUsd: 0.01, limitUsd: 5, remainingUsd: 4.99, periodStart: '2026-09-01T00:00:00.000Z' },
    ...over,
  };
}
