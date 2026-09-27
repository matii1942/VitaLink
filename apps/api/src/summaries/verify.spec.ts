import { describe, expect, it } from 'vitest';

import { MAX_SUMMARY_CHARACTERS, findInventedNumbers, verifySummary } from './verify.js';

const allowed = new Set([7, 24, 92, 104, 112, 15, 38.4, 1, 2, 3, 20, 74]);

describe('verifySummary', () => {
  it('accepts a summary whose every figure came from the record', () => {
    const text =
      'NEWS2 has risen to 7 over the last 20 hours. Respiration rate 24 and saturation 92% on a mask.';

    expect(verifySummary(text, allowed)).toEqual({ ok: true, invented: [], reason: null });
  });

  it('rejects a figure that was never measured', () => {
    // 96 is the shape of a plausible saturation, which is exactly what makes
    // it dangerous: nothing about the sentence looks wrong.
    const text = 'Saturation is improving to 96% on a mask.';
    const result = verifySummary(text, allowed);

    expect(result.ok).toBe(false);
    expect(result.invented).toEqual([96]);
  });

  it('reads a decimal comma as a decimal point', () => {
    expect(verifySummary('Temperature 38,4 degrees.', allowed).ok).toBe(true);
  });

  it('does not read the digit in a name as a measurement', () => {
    // NEWS2 and SpO2 end in digits. Treating those as figures would reject
    // almost every correct summary ever written.
    expect(verifySummary('NEWS2 is 7 and SpO2 is 92%.', allowed).ok).toBe(true);
  });

  it('rejects an empty answer', () => {
    expect(verifySummary('   ', allowed).ok).toBe(false);
  });

  it('rejects an answer that runs away', () => {
    const result = verifySummary('7 '.repeat(MAX_SUMMARY_CHARACTERS), allowed);

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('over the');
  });
});

describe('findInventedNumbers', () => {
  it('reports each invented figure once, in the order it appears', () => {
    expect(findInventedNumbers('First 55, then 66, then 55 again.', allowed)).toEqual([55, 66]);
  });

  it('finds nothing in text without figures', () => {
    expect(findInventedNumbers('The patient is stable and comfortable.', allowed)).toEqual([]);
  });
});
