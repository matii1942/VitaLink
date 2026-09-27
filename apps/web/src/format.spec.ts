import { describe, expect, it } from 'vitest';

import { riskLabel, sexInitial, timeAgo } from './format';

const now = new Date('2026-09-27T12:00:00.000Z');

describe('timeAgo', () => {
  it('counts minutes under an hour', () => {
    expect(timeAgo('2026-09-27T11:38:00.000Z', now)).toBe('22 min ago');
  });

  it('counts hours up to two days', () => {
    expect(timeAgo('2026-09-27T08:00:00.000Z', now)).toBe('4 h ago');
  });

  it('counts days beyond that', () => {
    expect(timeAgo('2026-09-24T12:00:00.000Z', now)).toBe('3 d ago');
  });

  it('says just now for an observation taken this minute', () => {
    expect(timeAgo('2026-09-27T11:59:40.000Z', now)).toBe('just now');
  });
});

describe('riskLabel', () => {
  it('spells the band out', () => {
    expect(riskLabel('low-medium', 'scored')).toBe('low-medium');
  });

  it('says a patient was deliberately not scored', () => {
    // Under sixteen: NEWS2 does not apply, and "no score" would read as an
    // omission rather than a decision (ADR 0005).
    expect(riskLabel(null, 'not-eligible')).toBe('not scored');
  });

  it('says there is no score when the scorer has not reached the observation', () => {
    expect(riskLabel(null, undefined)).toBe('no score');
  });
});

describe('sexInitial', () => {
  it('abbreviates the recorded values', () => {
    expect(sexInitial('female')).toBe('F');
    expect(sexInitial('male')).toBe('M');
  });

  it('does not invent one it was not given', () => {
    expect(sexInitial('unknown')).toBe('?');
  });
});
