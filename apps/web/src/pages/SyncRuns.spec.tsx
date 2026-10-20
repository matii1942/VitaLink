import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetFixtures, syncRun } from '../fixtures';
import { mockApi, mockApiDown, renderRoute } from '../test-utils';
import { duration, SyncRuns } from './SyncRuns';

function render() {
  return renderRoute('/sync', '/sync', <SyncRuns />);
}

function latestCard(): HTMLElement {
  return screen.getByText('Last run').closest('section') as HTMLElement;
}

beforeEach(resetFixtures);
afterEach(() => vi.unstubAllGlobals());

describe('duration', () => {
  it.each([
    [0, '0 ms'],
    [999, '999 ms'],
    [1000, '1.0 s'],
    [2784, '2.8 s'],
    [59_900, '59.9 s'],
    [72_000, '1 min 12 s'],
    [3_600_000, '60 min 0 s'],
  ])('writes %i ms as %s', (ms, expected) => {
    expect(duration(ms)).toBe(expected);
  });

  it('says a run with no end is still going', () => {
    expect(duration(null)).toBe('still running');
  });
});

describe('the synchronisation screen', () => {
  it('puts the most recent run first and on its own', async () => {
    mockApi({
      '/api/sync/runs': [
        syncRun({ observationsSynced: 519 }),
        syncRun({ observationsSynced: 500 }),
      ],
    });
    render();

    expect(await screen.findByText('Last run')).toBeInTheDocument();

    const tile = within(latestCard()).getByText('Observations').closest('.tile') as HTMLElement;
    expect(within(tile).getByText('519')).toBeInTheDocument();
  });

  it('says plainly when nothing was refused', async () => {
    mockApi({ '/api/sync/runs': [syncRun({ observationsRejected: 0 })] });
    render();

    expect(await screen.findByText(/nothing was dropped/i)).toBeInTheDocument();
    expect(screen.queryByText('Records that could not be read')).not.toBeInTheDocument();
  });

  it('shows what was refused and why, when something was', async () => {
    mockApi({
      '/api/sync/runs': [
        syncRun({
          observationsRejected: 1,
          issues: [
            { record: 'OBS-000123', field: 'respirationRate', reason: 'not a number: "--"' },
          ],
        }),
      ],
    });
    render();

    const table = (await screen.findByText('Records that could not be read')).closest(
      'section',
    ) as HTMLElement;

    expect(within(table).getByText('OBS-000123')).toBeInTheDocument();
    expect(within(table).getByText('respirationRate')).toBeInTheDocument();
    expect(within(table).getByText('not a number: "--"')).toBeInTheDocument();
  });

  it('writes a dash where an issue names no field', async () => {
    mockApi({
      '/api/sync/runs': [
        syncRun({
          observationsRejected: 1,
          issues: [{ record: 'OBS-000124', reason: 'recordedAt is in the future' }],
        }),
      ],
    });
    render();

    const table = (await screen.findByText('Records that could not be read')).closest(
      'section',
    ) as HTMLElement;

    expect(within(table).getByText('—')).toBeInTheDocument();
  });

  it('reports two identical runs as the ward not having grown', async () => {
    mockApi({ '/api/sync/runs': [syncRun(), syncRun()] });
    render();

    const panel = (await screen.findByTestId('idempotence')) as HTMLElement;
    expect(within(panel).getByText(/did not grow/i)).toBeInTheDocument();
  });

  it('does not claim idempotence when the two runs took in different amounts', async () => {
    mockApi({
      '/api/sync/runs': [
        syncRun({ observationsSynced: 540 }),
        syncRun({ observationsSynced: 519 }),
      ],
    });
    render();

    const panel = (await screen.findByTestId('idempotence')) as HTMLElement;
    expect(within(panel).queryByText(/did not grow/i)).not.toBeInTheDocument();
    expect(within(panel).getByText(/expected when new rounds were recorded/i)).toBeInTheDocument();
  });

  it('says nothing about idempotence from a single run', async () => {
    mockApi({ '/api/sync/runs': [syncRun()] });
    render();

    await screen.findByText('Last run');
    expect(screen.queryByTestId('idempotence')).not.toBeInTheDocument();
  });

  it('carries the status as a word, not only as a colour', async () => {
    mockApi({ '/api/sync/runs': [syncRun({ status: 'partial', observationsRejected: 2 })] });
    render();

    await screen.findByText('Last run');
    expect(within(latestCard()).getByText('partial')).toBeInTheDocument();
  });

  it('handles a run that has not finished yet', async () => {
    mockApi({
      '/api/sync/runs': [syncRun({ status: 'running', finishedAt: null, durationMs: null })],
    });
    render();

    expect(await screen.findByText('Last run')).toBeInTheDocument();
    expect(within(latestCard()).getByText('running')).toBeInTheDocument();
  });

  it('tells a reader with no runs why the screen is empty', async () => {
    mockApi({ '/api/sync/runs': [] });
    render();

    expect(await screen.findByText(/no synchronisation has run yet/i)).toBeInTheDocument();
  });

  it('says the request failed rather than showing an empty history', async () => {
    mockApiDown();
    render();

    expect(await screen.findByText(/could not load the runs/i)).toBeInTheDocument();
  });
});
