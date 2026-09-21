import { describe, it, expect } from 'vitest';
import legacy from '../src/data/legacy-format.js';

const {
  toLegacyDate,
  toLegacyDateTime,
  fromLegacyDateTime,
  toLegacyFlag,
  toLegacyTemp,
  toLegacySexCode,
  toLegacyObservation,
} = legacy;

describe('dates', () => {
  it('formats in Buenos Aires local time, three hours behind UTC', () => {
    expect(toLegacyDateTime(new Date('2026-09-20T17:30:00Z'))).toBe('20/09/2026 14:30');
  });

  it('moves back to the previous day when UTC has already passed midnight', () => {
    expect(toLegacyDateTime(new Date('2026-09-21T02:15:00Z'))).toBe('20/09/2026 23:15');
  });

  it('formats a date without the time', () => {
    expect(toLegacyDate(new Date('2026-09-20T17:30:00Z'))).toBe('20/09/2026');
  });

  it('reads a legacy string back into the same instant', () => {
    const instant = new Date('2026-09-20T17:30:00Z');
    expect(fromLegacyDateTime(toLegacyDateTime(instant))).toEqual(instant);
  });

  it('refuses a string that is not in DD/MM/YYYY HH:MM', () => {
    expect(fromLegacyDateTime('2026-09-20 14:30')).toBeNull();
    expect(fromLegacyDateTime('20/09/2026')).toBeNull();
  });

  it('keeps an absent date absent', () => {
    expect(toLegacyDateTime(null)).toBeNull();
  });
});

describe('temperature', () => {
  it('writes the decimal with a comma', () => {
    expect(toLegacyTemp(38.9)).toBe('38,9');
  });

  it('always shows one decimal place', () => {
    expect(toLegacyTemp(37)).toBe('37,0');
  });

  it('keeps a missing temperature missing', () => {
    expect(toLegacyTemp(null)).toBeNull();
  });
});

describe('flags', () => {
  it('writes booleans as S and N', () => {
    expect(toLegacyFlag(true)).toBe('S');
    expect(toLegacyFlag(false)).toBe('N');
  });

  it('does not turn an absent value into N', () => {
    expect(toLegacyFlag(null)).toBeNull();
  });
});

describe('sex code', () => {
  it('gives the same patient the same code every time', () => {
    expect(toLegacySexCode('female', 'MRN-000012')).toBe(toLegacySexCode('female', 'MRN-000012'));
  });

  it('uses both codings across the patient population', () => {
    const codes = new Set();
    for (let i = 1; i <= 20; i += 1) {
      codes.add(toLegacySexCode('female', `MRN-${String(i).padStart(6, '0')}`));
    }
    expect(codes).toEqual(new Set(['F', '2']));
  });

  it('codes an unknown sex as U', () => {
    expect(toLegacySexCode('unknown', 'MRN-000001')).toBe('U');
  });
});

describe('observation codes', () => {
  const base = {
    observationId: 'OBS-0000001',
    admissionId: 'ADM-000001',
    recordedAt: new Date('2026-09-20T17:30:00Z'),
    respirationRate: 18,
    oxygenSaturation: 96,
    respSupport: 'cannula',
    systolicBP: 120,
    pulse: 80,
    gcsEye: 4,
    gcsVerbal: 5,
    gcsMotor: 6,
    gcsTotal: 15,
    temperature: 36.8,
    recordedBy: 'ENF. SOSA',
  };

  it('translates respiratory support into the Spanish code', () => {
    expect(toLegacyObservation(base).respSupport).toBe('CANULA');
  });

  it('refuses a support mode the hospital has no code for', () => {
    expect(() => toLegacyObservation({ ...base, respSupport: 'psv' })).toThrow(/No legacy code/);
  });
});
