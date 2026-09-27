// Test files are ES modules (.mjs) even though this package is CommonJS:
// Vitest itself is ESM-only and cannot be require()d. The modules under test
// stay CommonJS and are pulled in through their default export.
import { describe, it, expect } from 'vitest';
import generate from '../src/data/generate.js';
import legacy from '../src/data/legacy-format.js';

const { generateDataset } = generate;

// A fixed reference date keeps these tests independent of the day they run.
const NOW = new Date('2026-09-20T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const dataset = generateDataset({ patientCount: 300, seed: 7, now: NOW });
const patientsByMrn = new Map(dataset.patients.map((p) => [p.mrn, p]));
const admissionsById = new Map(dataset.admissions.map((a) => [a.admissionId, a]));

function observationsByAdmission() {
  const map = new Map();
  for (const o of dataset.observations) {
    const list = map.get(o.admissionId) ?? [];
    list.push(o);
    map.set(o.admissionId, list);
  }
  return map;
}

describe('generateDataset', () => {
  it('is reproducible for a given seed and reference date', () => {
    const a = generateDataset({ patientCount: 40, seed: 1, now: NOW });
    const b = generateDataset({ patientCount: 40, seed: 1, now: NOW });
    expect(a).toEqual(b);
  });

  it('produces a different dataset for a different seed', () => {
    const a = generateDataset({ patientCount: 40, seed: 1, now: NOW });
    const b = generateDataset({ patientCount: 40, seed: 2, now: NOW });
    expect(a).not.toEqual(b);
  });

  it('creates one admission per patient', () => {
    expect(dataset.admissions).toHaveLength(dataset.patients.length);
  });
});

describe('admissions', () => {
  it('never discharges a patient before admitting them', () => {
    const backwards = dataset.admissions.filter(
      (a) => a.dischargedAt && a.dischargedAt <= a.admittedAt,
    );
    expect(backwards).toEqual([]);
  });

  it('keeps every patient at least 24 hours', () => {
    const tooShort = dataset.admissions.filter(
      (a) => a.dischargedAt && a.dischargedAt - a.admittedAt < DAY,
    );
    expect(tooShort).toEqual([]);
  });

  it('never has a scheduled admission arrive through emergency', () => {
    const impossible = dataset.admissions.filter(
      (a) =>
        a.admissionType === 'scheduled' &&
        ['emergency', 'transfer'].includes(a.sourceUnit),
    );
    expect(impossible).toEqual([]);
  });

  it('always gives an urgent admission a source unit', () => {
    const fromNowhere = dataset.admissions.filter(
      (a) => a.admissionType === 'urgent' && a.sourceUnit === null,
    );
    expect(fromNowhere).toEqual([]);
  });

  it('never pairs an elective diagnosis with an urgent admission', () => {
    const mismatched = dataset.admissions.filter(
      (a) => a.admissionType === 'urgent' && /programad/i.test(a.diagnosis),
    );
    expect(mismatched).toEqual([]);
  });

  it('sends every Scale 2 patient to internal medicine as an urgent readmission', () => {
    const copd = dataset.admissions.filter(
      (a) => patientsByMrn.get(a.mrn).trueScale === 2,
    );
    expect(copd.length).toBeGreaterThan(0);
    for (const a of copd) {
      expect(a.ward).toBe('internal-medicine');
      expect(a.admissionType).toBe('urgent');
      expect(a.firstAdmission).toBe(false);
    }
  });

  it('leaves some patients still in a bed', () => {
    const active = dataset.admissions.filter((a) => a.dischargedAt === null);
    expect(active.length).toBeGreaterThan(0);
    expect(active.length).toBeLessThan(dataset.admissions.length);
  });
});

describe('observations', () => {
  it('keeps every Glasgow total within 3 to 15', () => {
    const out = dataset.observations.filter((o) => o.gcsTotal < 3 || o.gcsTotal > 15);
    expect(out).toEqual([]);
  });

  it('keeps saturation within physiological bounds', () => {
    const out = dataset.observations.filter(
      (o) => o.oxygenSaturation !== null && (o.oxygenSaturation < 80 || o.oxygenSaturation > 100),
    );
    expect(out).toEqual([]);
  });

  it('never moves respiratory support by more than one step between rounds', () => {
    const ladder = ['room-air', 'cannula', 'mask', 'cpap', 'niv'];
    for (const list of observationsByAdmission().values()) {
      for (let i = 1; i < list.length; i += 1) {
        const jump = Math.abs(
          ladder.indexOf(list[i].respSupport) - ladder.indexOf(list[i - 1].respSupport),
        );
        expect(jump).toBeLessThanOrEqual(1);
      }
    }
  });

  it('never uses invasive or pressure-support modes (ADR 0002)', () => {
    const modes = new Set(dataset.observations.map((o) => o.respSupport));
    expect(modes.has('psv')).toBe(false);
  });

  it('gives Scale 2 patients a lower baseline saturation', () => {
    const firstSat = (scale) => {
      const values = [];
      for (const [admissionId, list] of observationsByAdmission()) {
        const admission = dataset.admissions.find((a) => a.admissionId === admissionId);
        const first = list.find((o) => o.oxygenSaturation !== null);
        if (first && patientsByMrn.get(admission.mrn).trueScale === scale) {
          values.push(first.oxygenSaturation);
        }
      }
      return values.reduce((sum, v) => sum + v, 0) / values.length;
    };

    expect(firstSat(2)).toBeLessThan(firstSat(1));
  });

  it('carries only a Glasgow total for observations before the migration (ADR 0004)', () => {
    const cutover = new Date(NOW.getTime() - 7 * DAY);
    const before = dataset.observations.filter((o) => o.recordedAt < cutover);
    const after = dataset.observations.filter((o) => o.recordedAt >= cutover);

    expect(before.length).toBeGreaterThan(0);
    for (const o of before) {
      expect(o.gcsEye).toBeNull();
      expect(o.gcsTotal).not.toBeNull();
    }
    for (const o of after) {
      expect(o.gcsEye).not.toBeNull();
      expect(o.gcsEye + o.gcsVerbal + o.gcsMotor).toBe(o.gcsTotal);
    }
  });

  it('includes some missing measurements', () => {
    const missingTemps = dataset.observations.filter((o) => o.temperature === null);
    expect(missingTemps.length).toBeGreaterThan(0);
  });
});

/**
 * A general ward is not a critical care unit, so the data must not contain a
 * patient whom a ward went on charting at a score that would have had them
 * moved. See ADR 0009.
 *
 * These are invariants about the shape of the story, not about specific values:
 * the generator never computes a NEWS2 score, and asserting one here would mean
 * a second implementation of the chart living in the simulator.
 */
describe('escalation to critical care', () => {
  const escalated = dataset.admissions.filter((a) => a.transferUnit !== null);

  it('escalates a minority of admissions', () => {
    expect(escalated.length).toBeGreaterThan(0);
    expect(escalated.length).toBeLessThan(dataset.admissions.length * 0.2);
  });

  it('asks for the unit that ward escalates to', () => {
    for (const a of escalated) {
      const expected = a.ward === 'cardiology' ? 'coronary-care' : 'intensive-care';
      expect(a.transferUnit).toBe(expected);
    }
  });

  it('never asks for a bed before the patient arrived', () => {
    const impossible = escalated.filter((a) => a.transferRequestedAt < a.admittedAt);
    expect(impossible).toEqual([]);
  });

  it('never sends an escalated patient home', () => {
    const home = escalated.filter((a) => a.dischargeDestination === 'home');
    expect(home).toEqual([]);
  });

  it('either transfers the patient or leaves them in the ward waiting', () => {
    for (const a of escalated) {
      if (a.dischargedAt === null) {
        // Still here, still on the ward board, waiting for a bed.
        expect(a.dischargeDestination).toBeNull();
      } else {
        expect(a.dischargeDestination).toBe(a.transferUnit);
        expect(a.dischargedAt.getTime()).toBeGreaterThan(a.transferRequestedAt.getTime());
        expect(a.dischargedAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
      }
    }
  });

  it('produces both endings somewhere in the dataset', () => {
    expect(escalated.some((a) => a.dischargedAt === null)).toBe(true);
    expect(escalated.some((a) => a.dischargedAt !== null)).toBe(true);
  });

  it('goes on charting at least one patient after the bed was asked for', () => {
    const rounds = observationsByAdmission();
    const waiting = escalated.filter((a) => a.dischargedAt === null);

    const stillCharted = waiting.filter((a) =>
      (rounds.get(a.admissionId) ?? []).some((o) => o.recordedAt > a.transferRequestedAt),
    );

    expect(stillCharted.length).toBeGreaterThan(0);
  });

  it('never leaves a confused patient unescalated', () => {
    // Confusion scores 3 on its own, which is a red score. A confused patient
    // whom nobody asked a bed for would be the exact record this ADR exists to
    // keep out of the dataset.
    const confused = dataset.observations.filter((o) => o.gcsEye !== null && o.gcsTotal < 15);

    expect(confused.length).toBeGreaterThan(0);
    for (const o of confused) {
      expect(admissionsById.get(o.admissionId).transferUnit).not.toBeNull();
    }
  });

  it('records where every patient who left went, and nowhere for those still here', () => {
    for (const a of dataset.admissions) {
      expect(a.dischargedAt === null).toBe(a.dischargeDestination === null);
    }
  });

  it('only ever sends a patient home, to intensive care or to coronary care', () => {
    const destinations = new Set(dataset.admissions.map((a) => a.dischargeDestination));
    destinations.delete(null);
    for (const destination of destinations) {
      expect(['home', 'intensive-care', 'coronary-care']).toContain(destination);
    }
  });
});

describe('the scale the hospital did not write down (ADR 0003)', () => {
  it('leaves some patients without a recorded scale', () => {
    const unrecorded = dataset.patients.filter((p) => p.news2Scale === null);

    // Without these, VitaLink's "assumed scale" path is code that runs in its
    // unit tests and never once in the data it was written for.
    expect(unrecorded.length).toBeGreaterThan(0);
    expect(unrecorded.length).toBeLessThan(dataset.patients.length * 0.25);
  });

  it('records a scale of 1 or 2 for everyone else', () => {
    for (const patient of dataset.patients) {
      expect([null, 1, 2]).toContain(patient.news2Scale);
    }
  });

  it('keeps the real scale even when it was not recorded', () => {
    // The point of the case: a Scale 2 patient whose scale nobody wrote down
    // still breathes like a Scale 2 patient, so the assumption of Scale 1 is
    // wrong about a real person rather than about a blank.
    const hidden = dataset.patients.filter((p) => p.news2Scale === null && p.trueScale === 2);

    expect(hidden.length).toBeGreaterThan(0);
  });

  it('never sends the real scale to a client', () => {
    const hidden = dataset.patients.find((p) => p.news2Scale === null);

    const sent = legacy.toLegacyPatient(hidden);

    expect(sent.news2Scale).toBeNull();
    expect(sent).not.toHaveProperty('trueScale');
  });
});

describe('the patient the red score rule exists for', () => {
  // A parameter sitting in its 3-scoring band on NEWS2 Scale 1.
  const EXTREMES = {
    pulse: (o) => o.pulse !== null && o.pulse <= 40,
    temperature: (o) => o.temperature !== null && o.temperature <= 35,
    respirationRate: (o) => o.respirationRate !== null && o.respirationRate >= 25,
    systolicBP: (o) => o.systolicBP !== null && o.systolicBP <= 90,
  };

  /** Admissions where one parameter is extreme in most of their rounds. */
  function withChronicExtreme() {
    const found = [];

    for (const [admissionId, list] of observationsByAdmission()) {
      for (const [name, isExtreme] of Object.entries(EXTREMES)) {
        const hits = list.filter(isExtreme).length;
        if (hits >= 2 && hits >= list.length * 0.6) {
          found.push({ admissionId, name, hits, rounds: list.length });
        }
      }
    }

    return found;
  }

  it('produces patients whose single abnormal parameter persists', () => {
    // Before this existed, the generator only ever deteriorated people as a
    // whole, so any parameter reaching 3 came with a total past 7. The
    // low-medium band was unreachable and the ward board proved it: nought
    // out of 1 025 patients.
    expect(withChronicExtreme().length).toBeGreaterThan(0);
  });

  it('spreads them across more than one parameter', () => {
    const names = new Set(withChronicExtreme().map((entry) => entry.name));

    // One kind of abnormality would exercise one branch of the scorer and
    // leave the rest exactly as unvisited as before.
    expect(names.size).toBeGreaterThan(1);
  });

  it('keeps them a minority of the ward', () => {
    const share = withChronicExtreme().length / dataset.admissions.length;

    expect(share).toBeLessThan(0.25);
  });
});
