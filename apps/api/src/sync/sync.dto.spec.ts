import { describe, expect, it } from 'vitest';

import { toSyncRunView, type SyncRunRecord } from './sync.dto.js';

/** A finished run with nothing to report, as the baseline to vary from. */
function record(overrides: Partial<SyncRunRecord> = {}): SyncRunRecord {
  return {
    id: '89df5ae8-08f0-4825-af25-cb36dfcc9e20',
    startedAt: new Date('2026-09-27T18:12:41.242Z'),
    finishedAt: new Date('2026-09-27T18:12:44.026Z'),
    status: 'succeeded',
    patientsSynced: 25,
    admissionsSynced: 25,
    observationsSynced: 519,
    observationsRejected: 0,
    scoresComputed: 519,
    errors: null,
    ...overrides,
  };
}

describe('toSyncRunView', () => {
  it('derives the duration from the two instants', () => {
    expect(toSyncRunView(record()).durationMs).toBe(2784);
  });

  it('has no duration while the run is still going', () => {
    const view = toSyncRunView(record({ finishedAt: null, status: 'running' }));

    expect(view.durationMs).toBeNull();
    expect(view.finishedAt).toBeNull();
  });

  it('reports no issues as an empty list, not null', () => {
    // A screen that maps over this should not have to ask first.
    expect(toSyncRunView(record()).issues).toEqual([]);
  });

  it('keeps the issues a run did record', () => {
    const errors = [
      { record: 'OBS-000123', field: 'respirationRate', reason: 'not a number: "--"' },
      { record: 'OBS-000124', reason: 'recordedAt is in the future' },
    ];

    expect(toSyncRunView(record({ errors })).issues).toEqual(errors);
  });

  // The column is a Json: it holds whatever was written into it, possibly by
  // a version of this code that no longer exists. These four cases are the
  // reason the mapper checks instead of trusting.
  it.each([
    ['a string', 'something went wrong'],
    ['an object', { record: 'OBS-1', reason: 'lonely' }],
    ['a number', 7],
    ['undefined', undefined],
  ])('answers with an empty list when errors holds %s', (_label, errors) => {
    expect(toSyncRunView(record({ errors })).issues).toEqual([]);
  });

  it('drops entries that are not issues and keeps the ones that are', () => {
    const errors = [{ record: 'OBS-1', reason: 'bad' }, null, 'nonsense', { reason: 'no record' }];

    expect(toSyncRunView(record({ errors })).issues).toEqual([
      { record: 'OBS-1', reason: 'bad' },
    ]);
  });

  it('passes the counts through untouched', () => {
    const view = toSyncRunView(record({ observationsRejected: 3, scoresComputed: 516 }));

    expect(view).toMatchObject({
      patientsSynced: 25,
      admissionsSynced: 25,
      observationsSynced: 519,
      observationsRejected: 3,
      scoresComputed: 516,
      status: 'succeeded',
    });
  });
});
