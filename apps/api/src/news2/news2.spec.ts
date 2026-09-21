import { describe, it, expect } from 'vitest';
import {
  calculateNews2,
  classifyRisk,
  scoreConsciousness,
  scorePulse,
  scoreRespirationRate,
  scoreSpO2Scale1,
  scoreSpO2Scale2,
  scoreSupplementalOxygen,
  scoreSystolicBP,
  scoreTemperature,
} from './news2.js';
import type { News2Input } from './news2.js';

// Every band is tested on both sides of each boundary. The pairs read as
// [value, expected score], straight from the RCP chart (ADR 0005).

describe('respiration rate', () => {
  it.each([
    [8, 3],
    [9, 1],
    [11, 1],
    [12, 0],
    [20, 0],
    [21, 2],
    [24, 2],
    [25, 3],
  ])('%i breaths/min scores %i', (rate, score) => {
    expect(scoreRespirationRate(rate)).toBe(score);
  });

  it('never scores 2 on the low side — the chart is not symmetric', () => {
    for (let rate = 1; rate <= 11; rate += 1) {
      expect(scoreRespirationRate(rate)).not.toBe(2);
    }
  });
});

describe('SpO2, scale 1', () => {
  it.each([
    [91, 3],
    [92, 2],
    [93, 2],
    [94, 1],
    [95, 1],
    [96, 0],
    [100, 0],
  ])('%i%% scores %i', (saturation, score) => {
    expect(scoreSpO2Scale1(saturation)).toBe(score);
  });
});

describe('SpO2, scale 2', () => {
  it.each([
    [83, 3],
    [84, 2],
    [85, 2],
    [86, 1],
    [87, 1],
    [88, 0],
    [92, 0],
  ])('%i%% scores %i whatever the oxygen', (saturation, score) => {
    expect(scoreSpO2Scale2(saturation, false)).toBe(score);
    expect(scoreSpO2Scale2(saturation, true)).toBe(score);
  });

  it.each([
    [93, 1],
    [94, 1],
    [95, 2],
    [96, 2],
    [97, 3],
    [100, 3],
  ])('%i%% on oxygen scores %i — over-oxygenation is penalised', (saturation, score) => {
    expect(scoreSpO2Scale2(saturation, true)).toBe(score);
  });

  it.each([93, 95, 97, 100])('%i%% on room air scores 0', (saturation) => {
    expect(scoreSpO2Scale2(saturation, false)).toBe(0);
  });
});

describe('supplemental oxygen', () => {
  it('scores 0 on air and 2 on oxygen', () => {
    expect(scoreSupplementalOxygen(false)).toBe(0);
    expect(scoreSupplementalOxygen(true)).toBe(2);
  });
});

describe('systolic blood pressure', () => {
  it.each([
    [90, 3],
    [91, 2],
    [100, 2],
    [101, 1],
    [110, 1],
    [111, 0],
    [219, 0],
    [220, 3],
  ])('%i mmHg scores %i', (pressure, score) => {
    expect(scoreSystolicBP(pressure)).toBe(score);
  });

  it('scores 190 mmHg as 0 — a known limitation of NEWS2, not a bug (ADR 0005)', () => {
    expect(scoreSystolicBP(190)).toBe(0);
  });
});

describe('pulse', () => {
  it.each([
    [40, 3],
    [41, 1],
    [50, 1],
    [51, 0],
    [90, 0],
    [91, 1],
    [110, 1],
    [111, 2],
    [130, 2],
    [131, 3],
  ])('%i beats/min scores %i', (rate, score) => {
    expect(scorePulse(rate)).toBe(score);
  });
});

describe('consciousness', () => {
  it('scores alert as 0', () => {
    expect(scoreConsciousness('A')).toBe(0);
  });

  it.each(['C', 'V', 'P', 'U'] as const)('scores %s as 3', (level) => {
    expect(scoreConsciousness(level)).toBe(3);
  });
});

describe('temperature', () => {
  it.each([
    [35.0, 3],
    [35.1, 1],
    [36.0, 1],
    [36.1, 0],
    [38.0, 0],
    [38.1, 1],
    [39.0, 1],
    [39.1, 2],
  ])('%s °C scores %i', (celsius, score) => {
    expect(scoreTemperature(celsius)).toBe(score);
  });

  it('never scores a fever higher than 2, however high', () => {
    expect(scoreTemperature(41.5)).toBe(2);
  });
});

describe('clinical risk', () => {
  it.each([
    [0, false, 'low'],
    [4, false, 'low'],
    [3, true, 'low-medium'],
    [5, false, 'medium'],
    [6, false, 'medium'],
    [7, false, 'high'],
  ] as const)('aggregate %i, red score %s -> %s', (aggregate, red, risk) => {
    expect(classifyRisk(aggregate, red)).toBe(risk);
  });

  it('a red score never lowers a medium or high aggregate', () => {
    expect(classifyRisk(5, true)).toBe('medium');
    expect(classifyRisk(8, true)).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// Whole observations
// ---------------------------------------------------------------------------

const wellPatient: News2Input = {
  respirationRate: 16,
  oxygenSaturation: 97,
  onOxygen: false,
  systolicBP: 125,
  pulse: 75,
  consciousness: 'A',
  temperature: 36.8,
  scale: 1,
};

describe('calculateNews2', () => {
  it('scores a well patient as 0, low risk, complete', () => {
    const result = calculateNews2(wellPatient);
    expect(result.aggregate).toBe(0);
    expect(result.risk).toBe('low');
    expect(result.partial).toBe(false);
    expect(result.redScore).toBe(false);
  });

  it('marks the score partial and names what is missing', () => {
    const result = calculateNews2({ ...wellPatient, temperature: null, respirationRate: null });
    expect(result.partial).toBe(true);
    expect(result.missing).toEqual(['respirationRate', 'temperature']);
    expect(result.parameters.temperature).toBeNull();
  });

  // The situation behind ADR 0003: an advanced COPD patient sitting at the
  // saturation they are meant to have, on a nasal cannula.
  const copdPatientAtTarget: News2Input = {
    ...wellPatient,
    oxygenSaturation: 90,
    onOxygen: true,
    respirationRate: 19,
  };

  it('scores a COPD patient at target as low risk on scale 2', () => {
    const result = calculateNews2({ ...copdPatientAtTarget, scale: 2 });
    expect(result.parameters.oxygenSaturation).toBe(0);
    expect(result.aggregate).toBe(2); // the oxygen itself
    expect(result.risk).toBe('low');
  });

  it('raises a false alarm for the same patient on scale 1', () => {
    const result = calculateNews2({ ...copdPatientAtTarget, scale: 1 });
    expect(result.parameters.oxygenSaturation).toBe(3);
    expect(result.aggregate).toBe(5);
    expect(result.risk).toBe('medium');
  });

  // ADM-000048 in the simulator: advanced COPD, nine days in, last round.
  it('scores a deteriorating COPD patient on NIV as high risk', () => {
    const result = calculateNews2({
      respirationRate: 34,
      oxygenSaturation: 80,
      onOxygen: true,
      systolicBP: 114,
      pulse: 107,
      consciousness: 'C',
      temperature: 38.4,
      scale: 2,
    });
    expect(result.parameters).toEqual({
      respirationRate: 3,
      oxygenSaturation: 3,
      supplementalOxygen: 2,
      systolicBP: 0,
      pulse: 1,
      consciousness: 3,
      temperature: 1,
    });
    expect(result.aggregate).toBe(13);
    expect(result.risk).toBe('high');
    expect(result.redScore).toBe(true);
  });

  // A post-operative sepsis picture with the temperature never taken. The
  // score is incomplete and still high — partial does not mean reassuring.
  it('reaches high risk even when the score is partial', () => {
    const result = calculateNews2({
      respirationRate: 27,
      oxygenSaturation: 91,
      onOxygen: true,
      systolicBP: 113,
      pulse: 110,
      consciousness: 'A',
      temperature: null,
      scale: 1,
    });
    expect(result.aggregate).toBe(9);
    expect(result.partial).toBe(true);
    expect(result.risk).toBe('high');
  });
});
