import { describe, it, expect } from 'vitest';
import { glasgowToAcvpu } from './consciousness.js';

const gcs = (eye: number | null, verbal: number | null, motor: number | null) => ({
  eye,
  verbal,
  motor,
  total: (eye ?? 0) + (verbal ?? 0) + (motor ?? 0) || 15,
});

// One case per row of the table in ADR 0006.
describe('glasgowToAcvpu', () => {
  it('reads eyes open and oriented as alert', () => {
    expect(glasgowToAcvpu(gcs(4, 5, 6))).toBe('A');
  });

  it('reads eyes open but not oriented as confusion', () => {
    expect(glasgowToAcvpu(gcs(4, 4, 6))).toBe('C');
  });

  it('reads eyes opening to voice as V', () => {
    expect(glasgowToAcvpu(gcs(3, 4, 6))).toBe('V');
  });

  it('reads eyes opening to pain as P', () => {
    expect(glasgowToAcvpu(gcs(2, 2, 5))).toBe('P');
  });

  it('reads closed eyes with a motor response as P, not U', () => {
    expect(glasgowToAcvpu(gcs(1, 1, 5))).toBe('P');
  });

  it('reads a Glasgow of 3 as unresponsive', () => {
    expect(glasgowToAcvpu(gcs(1, 1, 1))).toBe('U');
  });

  it('cannot convert a record that kept only the total (ADR 0004)', () => {
    expect(glasgowToAcvpu({ eye: null, verbal: null, motor: null, total: 15 })).toBeNull();
  });

  it('reads a lucid patient who cannot speak as confused — a known limitation (ADR 0006)', () => {
    // Motor neurone disease: fully alert, eyes open, verbal low from the
    // disease itself. The Glasgow cannot tell this from new confusion.
    expect(glasgowToAcvpu(gcs(4, 2, 6))).toBe('C');
  });
});
