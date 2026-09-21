// Test files are ES modules (.mjs) even though this package is CommonJS:
// Vitest itself is ESM-only and cannot be require()d. The modules under test
// stay CommonJS and are pulled in through their default export.
import { describe, it, expect } from 'vitest';
import generate from '../src/data/generate.js';

const { generateDataset } = generate;

// A fixed reference date keeps these tests independent of the day they run.
const NOW = new Date('2026-09-20T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const dataset = generateDataset({ patientCount: 300, seed: 7, now: NOW });
const patientsByMrn = new Map(dataset.patients.map((p) => [p.mrn, p]));

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
      (a) => patientsByMrn.get(a.mrn).news2Scale === 2,
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
        if (first && patientsByMrn.get(admission.mrn).news2Scale === scale) {
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
