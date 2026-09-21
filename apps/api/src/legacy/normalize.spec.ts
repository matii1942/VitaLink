import { describe, it, expect } from 'vitest';
import {
  NormalizationError,
  normalizeAdmission,
  normalizeObservation,
  normalizePatient,
  parseLegacyDate,
  parseLegacyDateTime,
  parseLegacyFlag,
  parseLegacyTemperature,
  toList,
  unwrap,
} from './normalize.js';
import type {
  LegacyAdmission,
  LegacyObservation,
  LegacyPatient,
} from './legacy.types.js';

// What the node-soap client hands over for an empty field. Captured from the
// running simulator, not invented.
const NIL = { attributes: { 'xsi:nil': 'true' } };

const patientFromWire: LegacyPatient = {
  mrn: 'MRN-000001',
  nationalId: '19524815',
  familyName: 'TAFOYA NAVA',
  givenName: 'Mario',
  birthDate: '11/03/1960',
  sexCode: '1',
  news2Scale: '2',
};

const activeAdmissionFromWire: LegacyAdmission = {
  admissionId: 'ADM-000001',
  mrn: 'MRN-000001',
  admittedAt: '17/09/2026 04:44',
  dischargedAt: NIL,
  ward: 'internal-medicine',
  admissionType: 'URG',
  sourceUnit: 'GUARDIA',
  diagnosis: 'Insuficiencia respiratoria cronica reagudizada',
  firstAdmission: 'N',
};

// Pre-migration: Glasgow components are nil, only the total survived.
const observationFromWire: LegacyObservation = {
  observationId: 'OBS-0000044',
  admissionId: 'ADM-000005',
  recordedAt: '11/09/2026 23:22',
  respirationRate: NIL,
  oxygenSaturation: 99,
  respSupport: 'AIRE',
  systolicBP: 110,
  pulse: 91,
  gcsEye: NIL,
  gcsVerbal: NIL,
  gcsMotor: NIL,
  gcsTotal: 15,
  temperature: NIL,
  recordedBy: 'ENF. QUIROGA',
};

describe('absence', () => {
  it('reads the xsi:nil object as null, not as a present value', () => {
    expect(unwrap(NIL)).toBeNull();
  });

  it('treats undefined and null the same way', () => {
    expect(unwrap(undefined)).toBeNull();
    expect(unwrap(null)).toBeNull();
  });

  it('turns an empty list wrapper into an empty array', () => {
    expect(toList(null)).toEqual([]);
  });

  it('wraps a lone element in an array', () => {
    expect(toList({ id: 1 })).toEqual([{ id: 1 }]);
  });
});

describe('dates and times', () => {
  it('reads the local time as Buenos Aires, three hours behind UTC', () => {
    expect(parseLegacyDateTime('t', '20/09/2026 14:30')).toEqual(
      new Date('2026-09-20T17:30:00Z'),
    );
  });

  it('moves forward to the next UTC day for a late evening time', () => {
    expect(parseLegacyDateTime('t', '20/09/2026 23:15')).toEqual(
      new Date('2026-09-21T02:15:00Z'),
    );
  });

  it('returns null for an absent date', () => {
    expect(parseLegacyDateTime('t', NIL)).toBeNull();
  });

  it('refuses an ISO string, because the contract says DD/MM/YYYY', () => {
    expect(() => parseLegacyDateTime('t', '2026-09-20 14:30')).toThrow(NormalizationError);
  });

  it('refuses a date that does not exist', () => {
    expect(() => parseLegacyDateTime('t', '31/02/2026 10:00')).toThrow(/calendar date/);
  });

  it('holds a date of birth at midnight UTC of that day', () => {
    expect(parseLegacyDate('d', '11/03/1960')).toEqual(new Date('1960-03-11T00:00:00Z'));
  });
});

describe('temperature', () => {
  it('reads a comma decimal', () => {
    expect(parseLegacyTemperature('t', '36,8')).toBe(36.8);
  });

  it('does not silently drop the decimal the way parseFloat does', () => {
    expect(Number.parseFloat('38,9')).toBe(38);
    expect(parseLegacyTemperature('t', '38,9')).toBe(38.9);
  });

  it('refuses a dot, because the contract says comma', () => {
    expect(() => parseLegacyTemperature('t', '36.8')).toThrow(NormalizationError);
  });

  it('returns null for an absent temperature', () => {
    expect(parseLegacyTemperature('t', NIL)).toBeNull();
  });
});

describe('flags', () => {
  it("reads 'S' and 'N'", () => {
    expect(parseLegacyFlag('f', 'S')).toBe(true);
    expect(parseLegacyFlag('f', 'N')).toBe(false);
  });

  it('refuses anything else, including an English yes', () => {
    expect(() => parseLegacyFlag('f', 'Y')).toThrow(NormalizationError);
  });
});

describe('normalizePatient', () => {
  it('normalises a patient exactly as the wire delivered it', () => {
    expect(normalizePatient(patientFromWire)).toEqual({
      mrn: 'MRN-000001',
      nationalId: '19524815',
      familyName: 'TAFOYA NAVA',
      givenName: 'Mario',
      birthDate: new Date('1960-03-11T00:00:00Z'),
      sex: 'male',
      news2Scale: 2,
    });
  });

  it('reads both sex codings', () => {
    const sexOf = (sexCode: string) => normalizePatient({ ...patientFromWire, sexCode }).sex;
    expect([sexOf('M'), sexOf('1')]).toEqual(['male', 'male']);
    expect([sexOf('F'), sexOf('2')]).toEqual(['female', 'female']);
    expect(sexOf('U')).toBe('unknown');
  });

  it('keeps a missing NEWS2 scale as null rather than guessing one (ADR 0003)', () => {
    expect(normalizePatient({ ...patientFromWire, news2Scale: NIL }).news2Scale).toBeNull();
  });

  it('refuses a scale that NEWS2 does not have', () => {
    expect(() => normalizePatient({ ...patientFromWire, news2Scale: '3' })).toThrow(/news2Scale/);
  });
});

describe('normalizeAdmission', () => {
  it('normalises an active admission, with the xsi:nil discharge as null', () => {
    expect(normalizeAdmission(activeAdmissionFromWire)).toEqual({
      admissionId: 'ADM-000001',
      mrn: 'MRN-000001',
      admittedAt: new Date('2026-09-17T07:44:00Z'),
      dischargedAt: null,
      ward: 'internal-medicine',
      admissionType: 'urgent',
      sourceUnit: 'emergency',
      diagnosis: 'Insuficiencia respiratoria cronica reagudizada',
      firstAdmission: false,
    });
  });

  it('does not mistake the nil discharge for a discharged patient', () => {
    const admission = normalizeAdmission(activeAdmissionFromWire);
    expect(admission.dischargedAt).toBeNull();
    expect(Boolean(activeAdmissionFromWire.dischargedAt)).toBe(true); // the trap
  });
});

describe('normalizeObservation', () => {
  it('normalises a pre-migration observation with missing values', () => {
    expect(normalizeObservation(observationFromWire)).toEqual({
      observationId: 'OBS-0000044',
      admissionId: 'ADM-000005',
      recordedAt: new Date('2026-09-12T02:22:00Z'),
      respirationRate: null,
      oxygenSaturation: 99,
      respiratorySupport: 'room-air',
      systolicBP: 110,
      pulse: 91,
      gcs: { eye: null, verbal: null, motor: null, total: 15 },
      temperature: null,
      recordedBy: 'ENF. QUIROGA',
    });
  });

  it('keeps Glasgow components when they are present', () => {
    const obs = normalizeObservation({
      ...observationFromWire,
      gcsEye: 4,
      gcsVerbal: 4,
      gcsMotor: 6,
      gcsTotal: 14,
    });
    expect(obs.gcs).toEqual({ eye: 4, verbal: 4, motor: 6, total: 14 });
  });

  it('refuses components that do not add up to the total', () => {
    expect(() =>
      normalizeObservation({ ...observationFromWire, gcsEye: 4, gcsVerbal: 5, gcsMotor: 6, gcsTotal: 13 }),
    ).toThrow(/components sum to 15/);
  });

  it('refuses a Glasgow total below 3, which no living patient can have', () => {
    expect(() => normalizeObservation({ ...observationFromWire, gcsTotal: 2 })).toThrow(/gcsTotal/);
  });

  it('refuses a saturation above 100%', () => {
    expect(() => normalizeObservation({ ...observationFromWire, oxygenSaturation: 101 })).toThrow(
      /oxygenSaturation/,
    );
  });

  it('refuses a support mode outside ward scope (ADR 0002)', () => {
    expect(() => normalizeObservation({ ...observationFromWire, respSupport: 'PSV' })).toThrow(
      /respSupport/,
    );
  });

  it('names the offending field when it refuses', () => {
    try {
      normalizeObservation({ ...observationFromWire, temperature: '36.8' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(NormalizationError);
      expect((error as NormalizationError).field).toBe('temperature');
    }
  });
});
