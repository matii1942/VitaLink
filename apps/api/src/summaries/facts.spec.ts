import { describe, expect, it } from 'vitest';

import {
  buildFactSheet,
  type FactObservation,
  type FactSheetInput,
} from './facts.js';

const now = new Date('2026-09-27T08:00:00Z');

function observation(hoursAgo: number, over: Partial<FactObservation> = {}): FactObservation {
  return {
    observationId: `obs-${hoursAgo}`,
    recordedAt: new Date(now.getTime() - hoursAgo * 3_600_000),
    respirationRate: 20,
    oxygenSaturation: 94,
    respiratorySupport: 'cannula',
    systolicBP: 112,
    pulse: 98,
    gcsTotal: 15,
    temperature: 37.8,
    score: {
      status: 'scored',
      notEligibleReason: null,
      aggregate: 5,
      risk: 'medium',
      partial: false,
      redScore: false,
      missing: [],
    },
    ...over,
  };
}

function input(over: Partial<FactSheetInput> = {}): FactSheetInput {
  return {
    patient: { familyName: 'Gómez', givenName: 'Ana', ageYears: 74, sex: 'female' },
    admission: {
      admittedAt: new Date('2026-09-24T09:00:00Z'),
      ward: 'general-medicine',
      admissionType: 'urgent',
      sourceUnit: 'emergency',
      diagnosis: 'community-acquired pneumonia',
      transferUnit: null,
    },
    observations: [observation(2), observation(6)],
    now,
    ...over,
  };
}

describe('buildFactSheet', () => {
  it('puts every figure it prints onto the allowed list', () => {
    // The guarantee the verifier depends on. Pull the figures back out of the
    // finished text and every one of them must be on the list — if a line is
    // ever added that writes a number without registering it, this fails.
    const sheet = buildFactSheet(input());
    const printed = [...sheet.text.matchAll(/(?<![A-Za-z])\d+(?:\.\d+)?/g)].map((match) =>
      Number.parseFloat(match[0]),
    );

    expect(printed.length).toBeGreaterThan(0);

    for (const figure of printed) {
      expect(sheet.allowedNumbers).toContain(figure);
    }
  });

  it('reports the newest observation as the watermark', () => {
    const sheet = buildFactSheet(input({ observations: [observation(2), observation(6)] }));

    expect(sheet.through.observationId).toBe('obs-2');
    expect(sheet.roundsUsed).toBe(2);
  });

  it('counts the day of stay from the admission, starting at one', () => {
    // Admitted three days and change ago: this is day 4 for a ward, not day 3.
    const sheet = buildFactSheet(
      input({ admission: { ...input().admission, admittedAt: new Date('2026-09-23T09:00:00Z') } }),
    );

    expect(sheet.text).toContain('day of stay: 4');
  });

  it('says a critical care bed was asked for, and that the patient is still here', () => {
    const sheet = buildFactSheet(
      input({ admission: { ...input().admission, transferUnit: 'intensive-care' } }),
    );

    expect(sheet.text).toContain('critical care bed requested: yes, intensive-care');
    expect(sheet.text).toContain('still in the ward');
  });

  it('states a missing measurement instead of leaving a gap', () => {
    const sheet = buildFactSheet({ ...input(), observations: [observation(2, { pulse: null })] });

    expect(sheet.text).toContain('pulse not recorded');
  });

  it('names a missing parameter the way a clinician would', () => {
    const sheet = buildFactSheet({
      ...input(),
      observations: [
        observation(2, {
          score: {
            status: 'scored',
            notEligibleReason: null,
            aggregate: 4,
            risk: 'low-medium',
            partial: true,
            redScore: false,
            missing: ['systolicBP'],
          },
        }),
      ],
    });

    expect(sheet.text).toContain('missing systolic blood pressure');
    expect(sheet.text).not.toContain('systolicBP');
  });

  it('marks a partial aggregate as a lower bound', () => {
    const sheet = buildFactSheet({
      ...input(),
      observations: [
        observation(2, {
          score: {
            status: 'scored',
            notEligibleReason: null,
            aggregate: 4,
            risk: 'low-medium',
            partial: true,
            redScore: false,
            missing: ['pulse'],
          },
        }),
      ],
    });

    expect(sheet.text).toContain('lower bound only');
  });

  it('carries the red score through, because it escalates on its own', () => {
    const sheet = buildFactSheet({
      ...input(),
      observations: [
        observation(2, {
          score: {
            status: 'scored',
            notEligibleReason: null,
            aggregate: 6,
            risk: 'medium',
            partial: false,
            redScore: true,
            missing: [],
          },
        }),
      ],
    });

    expect(sheet.text).toContain('escalate regardless of the total');
  });

  it('says when a patient is not eligible to be scored', () => {
    const sheet = buildFactSheet({
      ...input(),
      observations: [
        observation(2, {
          score: {
            status: 'not-eligible',
            notEligibleReason: 'under-16',
            aggregate: null,
            risk: null,
            partial: null,
            redScore: null,
            missing: [],
          },
        }),
      ],
    });

    expect(sheet.text).toContain('NEWS2 not applicable (under-16)');
  });

  it('says when the sync has written an observation the scorer has not reached', () => {
    const sheet = buildFactSheet({
      ...input(),
      observations: [observation(2, { score: null })],
    });

    expect(sheet.text).toContain('NEWS2 not yet calculated');
  });

  it('refuses to build a sheet with nothing to summarise', () => {
    // A summary of no observations would be a paragraph invented in full.
    expect(() => buildFactSheet({ ...input(), observations: [] })).toThrow(
      /at least one observation/,
    );
  });
});
