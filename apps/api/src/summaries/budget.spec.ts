import { describe, expect, it } from 'vitest';

import { monthStart, toUsd } from './budget.service.js';

describe('monthStart', () => {
  it('goes back to midnight on the first, in UTC', () => {
    expect(monthStart(new Date('2026-09-27T02:13:44.512Z')).toISOString()).toBe(
      '2026-09-01T00:00:00.000Z',
    );
  });

  it('is already the start on the first instant of a month', () => {
    expect(monthStart(new Date('2026-09-01T00:00:00.000Z')).toISOString()).toBe(
      '2026-09-01T00:00:00.000Z',
    );
  });

  it('uses the UTC month, not the local one', () => {
    // 21:30 on 31 August in Buenos Aires is already September in UTC. The
    // budget period follows UTC so that it means the same thing wherever the
    // process happens to be running — a Lambda in Ohio, a laptop here.
    expect(monthStart(new Date('2026-09-01T00:30:00.000Z')).toISOString()).toBe(
      '2026-09-01T00:00:00.000Z',
    );
  });
});

describe('toUsd', () => {
  it('turns millionths into dollars', () => {
    expect(toUsd(2_300)).toBe(0.0023);
  });

  it('reports a whole budget cleanly', () => {
    expect(toUsd(5_000_000)).toBe(5);
  });

  it('reports nothing spent as zero', () => {
    expect(toUsd(0)).toBe(0);
  });
});
