import { describe, expect, it } from 'vitest';

import { CAPTURED_AT, DemoMiss, demoGet, fold, shiftTimes } from './demo';

describe('shiftTimes', () => {
  const HOUR = 3_600_000;

  it('moves an instant forward by the delta', () => {
    expect(shiftTimes('2026-09-27T18:00:00.000Z', HOUR)).toBe('2026-09-27T19:00:00.000Z');
  });

  it('leaves a bare calendar date alone', () => {
    // A date of birth is not a point in the recording. Shifting it would
    // eventually change the patient's age, and the age is already in the
    // payload — the two would then disagree on the same screen.
    expect(shiftTimes({ birthDate: '1941-04-24' }, HOUR)).toEqual({ birthDate: '1941-04-24' });
  });

  it('leaves the frozen keys alone even when they hold an instant', () => {
    expect(shiftTimes({ periodStart: '2026-09-01T00:00:00.000Z' }, HOUR)).toEqual({
      periodStart: '2026-09-01T00:00:00.000Z',
    });
  });

  it('leaves text that merely contains digits alone', () => {
    expect(shiftTimes({ text: 'NEWS2 4 at 18 hours ago' }, HOUR)).toEqual({
      text: 'NEWS2 4 at 18 hours ago',
    });
  });

  it('preserves the interval between two instants, which is what the screens show', () => {
    const shifted = shiftTimes(
      { a: '2026-09-27T12:00:00.000Z', b: '2026-09-27T18:00:00.000Z' },
      5 * HOUR,
    ) as { a: string; b: string };

    expect(new Date(shifted.b).getTime() - new Date(shifted.a).getTime()).toBe(6 * HOUR);
  });

  it('walks nested objects and arrays', () => {
    const shifted = shiftTimes({ rows: [{ recordedAt: '2026-09-27T18:00:00.000Z' }] }, HOUR);

    expect(shifted).toEqual({ rows: [{ recordedAt: '2026-09-27T19:00:00.000Z' }] });
  });
});

describe('the recording', () => {
  it('records when it was captured', () => {
    expect(Number.isNaN(new Date(CAPTURED_AT).getTime())).toBe(false);
  });

  it('answers a recorded path', async () => {
    await expect(demoGet('/wards')).resolves.toBeInstanceOf(Array);
  });

  it('reports a path it does not cover as a 404 rather than hanging', async () => {
    await expect(demoGet('/wards/nowhere/board')).rejects.toBeInstanceOf(DemoMiss);
  });

  it('rejects with AbortError when the caller cancels', async () => {
    const controller = new AbortController();
    const pending = demoGet('/wards', controller.signal);

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('fold', () => {
  it.each([
    ['VÁZQUEZ', 'vazquez'],
    ['vazquez', 'vazquez'],
    ['Verónica', 'veronica'],
    ['PEÑA', 'pena'],
    ['MRN-000021', 'mrn-000021'],
  ])('reduces %s to %s', (input, expected) => {
    expect(fold(input)).toBe(expected);
  });
});

describe('the recorded search', () => {
  it('answers a query the recording does not literally hold', async () => {
    // The one path the demo computes instead of replaying. Everything else
    // 404s when it was not recorded; this has to not.
    const page = await demoGet<{ total: number; data: { familyName: string }[] }>(
      '/patients/search?q=vazquez&pageSize=25',
    );

    expect(page.total).toBeGreaterThan(0);
    expect(page.data.every((p) => fold(p.familyName).includes('vazquez'))).toBe(true);
  });

  it('folds the accents in both directions', async () => {
    const plain = await demoGet<{ total: number }>('/patients/search?q=vazquez&pageSize=25');
    const accented = await demoGet<{ total: number }>(
      `/patients/search?q=${encodeURIComponent('VÁZQUEZ')}&pageSize=25`,
    );

    expect(accented.total).toBe(plain.total);
  });

  it('answers an empty search with everybody', async () => {
    const page = await demoGet<{ total: number }>('/patients/search?q=&pageSize=25');

    expect(page.total).toBe(25);
  });

  it('answers a search that matches nobody with an empty page, not a miss', async () => {
    const page = await demoGet<{ total: number; data: unknown[]; totalPages: number }>(
      '/patients/search?q=nobodyhasthisname&pageSize=25',
    );

    expect(page).toMatchObject({ total: 0, data: [], totalPages: 1 });
  });

  it('still refuses a path that is not a search and was not recorded', async () => {
    await expect(demoGet('/patients/MRN-999999')).rejects.toBeInstanceOf(DemoMiss);
  });
});
