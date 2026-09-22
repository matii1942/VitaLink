import { describe, it, expect } from 'vitest';
import { NEWS2_ENGINE_VERSION } from '../news2/news2.js';
import type { ObservationScore } from '../news2/score-observation.js';
import { finalStatus, observationRow, scoreRow } from './sync.mapper.js';

describe('observationRow', () => {
  it('flattens the Glasgow object into its four columns', () => {
    const row = observationRow({
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
    });
    expect(row).toMatchObject({ gcsEye: 4, gcsVerbal: 5, gcsMotor: 6, gcsTotal: 15 });
    expect(row).not.toHaveProperty('gcs');
  });
});

describe('scoreRow', () => {
  const scored: ObservationScore = {
    observationId: 'OBS-0000001',
    status: 'scored',
    scaleUsed: 2,
    scaleSource: 'recorded',
    result: {
      aggregate: 13,
      risk: 'high',
      partial: false,
      redScore: true,
      missing: [],
      parameters: {
        respirationRate: 3,
        oxygenSaturation: 3,
        supplementalOxygen: 2,
        systolicBP: 0,
        pulse: 1,
        consciousness: 3,
        temperature: 1,
      },
    },
  };

  it('stores every parameter score in its own column', () => {
    expect(scoreRow(scored)).toMatchObject({
      aggregate: 13,
      risk: 'high',
      scaleUsed: 2,
      respirationRateScore: 3,
      consciousnessScore: 3,
      temperatureScore: 1,
    });
  });

  it('stamps the engine version on every score', () => {
    expect(scoreRow(scored).engineVersion).toBe(NEWS2_ENGINE_VERSION);
  });

  it('stores a deliberate non-score with its reason instead of dropping it', () => {
    const row = scoreRow({ observationId: 'OBS-0000002', status: 'not-eligible', reason: 'under-16' });
    expect(row).toMatchObject({
      status: 'not-eligible',
      notEligibleReason: 'under-16',
      aggregate: null,
      risk: null,
    });
  });
});

describe('finalStatus', () => {
  it('is succeeded only when nothing had to be skipped', () => {
    expect(finalStatus(0)).toBe('succeeded');
  });

  it('is partial when any record was refused or skipped', () => {
    expect(finalStatus(1)).toBe('partial');
  });
});
