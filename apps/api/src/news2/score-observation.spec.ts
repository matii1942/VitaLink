import { describe, it, expect } from 'vitest';
import { ageAt, scoreObservation } from './score-observation.js';
import type { Observation, Patient } from '../domain/clinical.js';

const patient: Patient = {
  mrn: 'MRN-000001',
  nationalId: '19524815',
  familyName: 'TAFOYA NAVA',
  givenName: 'Mario',
  birthDate: new Date('1960-03-11T00:00:00Z'),
  sex: 'male',
  news2Scale: 1,
};

const observation: Observation = {
  observationId: 'OBS-0000001',
  admissionId: 'ADM-000001',
  recordedAt: new Date('2026-09-20T17:30:00Z'),
  respirationRate: 16,
  oxygenSaturation: 97,
  respiratorySupport: 'room-air',
  systolicBP: 125,
  pulse: 75,
  gcs: { eye: 4, verbal: 5, motor: 6, total: 15 },
  temperature: 36.8,
  recordedBy: 'ENF. SOSA',
};

function scored(p: Patient, o: Observation) {
  const score = scoreObservation(p, o);
  if (score.status !== 'scored') throw new Error('expected a score');
  return score;
}

describe('ageAt', () => {
  it('counts a birthday not yet reached this year', () => {
    expect(ageAt(new Date('2010-12-01T00:00:00Z'), new Date('2026-09-20T00:00:00Z'))).toBe(15);
  });

  it('counts the birthday itself as the new age', () => {
    expect(ageAt(new Date('2010-09-20T00:00:00Z'), new Date('2026-09-20T00:00:00Z'))).toBe(16);
  });
});

describe('scoreObservation', () => {
  it('scores a well adult as 0', () => {
    expect(scored(patient, observation).result.aggregate).toBe(0);
  });

  it('refuses to score a patient under 16 (ADR 0005)', () => {
    const child = { ...patient, birthDate: new Date('2012-01-01T00:00:00Z') };
    expect(scoreObservation(child, observation)).toEqual({
      observationId: 'OBS-0000001',
      status: 'not-eligible',
      reason: 'under-16',
    });
  });

  it('scores a patient on their sixteenth birthday', () => {
    const sixteen = { ...patient, birthDate: new Date('2010-09-20T00:00:00Z') };
    expect(scoreObservation(sixteen, observation).status).toBe('scored');
  });

  it('records the scale as recorded when the patient has one', () => {
    expect(scored(patient, observation).scaleSource).toBe('recorded');
  });

  it('falls back to scale 1 and says so when none was recorded (ADR 0003)', () => {
    const noScale = { ...patient, news2Scale: null };
    const saturation90 = { ...observation, oxygenSaturation: 90 };
    const score = scored(noScale, saturation90);

    expect(score.scaleSource).toBe('assumed');
    expect(score.result.parameters.oxygenSaturation).toBe(3); // scale 1 applied
  });

  it('counts every support mode except room air as supplemental oxygen', () => {
    for (const support of ['cannula', 'mask', 'cpap', 'niv'] as const) {
      const on = { ...observation, respiratorySupport: support };
      expect(scored(patient, on).result.parameters.supplementalOxygen).toBe(2);
    }
    expect(scored(patient, observation).result.parameters.supplementalOxygen).toBe(0);
  });

  it('converts Glasgow to ACVPU before scoring consciousness (ADR 0006)', () => {
    const confused = { ...observation, gcs: { eye: 4, verbal: 4, motor: 6, total: 14 } };
    expect(scored(patient, confused).result.parameters.consciousness).toBe(3);
  });

  it('leaves consciousness unscored for a pre-migration record', () => {
    const migrated = { ...observation, gcs: { eye: null, verbal: null, motor: null, total: 15 } };
    const score = scored(patient, migrated);

    expect(score.result.parameters.consciousness).toBeNull();
    expect(score.result.partial).toBe(true);
    expect(score.result.missing).toContain('consciousness');
  });
});
