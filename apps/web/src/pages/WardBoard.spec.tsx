/**
 * The ward board, as a reader meets it.
 *
 * These tests assert on what is on screen — text, rows, order — not on the
 * component's internals. A test that reaches for a state variable passes
 * after a refactor that broke the page; a test that reads the page fails.
 */
import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { board, boardRow, observation, resetFixtures, score } from '../fixtures';
import { mockApi, mockApiDown, renderRoute } from '../test-utils';
import { WardBoard } from './WardBoard';

const PATH = '/api/wards/internal-medicine/board';

function show() {
  return renderRoute('/wards/:ward', '/wards/internal-medicine', <WardBoard />);
}

/** The visible text of each body row's first cell, top to bottom. */
function scoresOnScreen(): string[] {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent ?? '');
}

beforeEach(() => {
  resetFixtures();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WardBoard', () => {
  it('renders the rows in the order the server sent them', async () => {
    // The server orders by acuity in SQL (ADR 0010). If this screen ever
    // starts sorting on its own, these two rows come back the other way
    // round and this test is the thing that notices.
    mockApi({
      [PATH]: board([
        boardRow({
          latestObservation: observation({ score: score({ aggregate: 2, risk: 'low' }) }),
        }),
        boardRow({
          latestObservation: observation({ score: score({ aggregate: 9, risk: 'high' }) }),
        }),
      ]),
    });

    show();

    await screen.findByRole('table');

    expect(scoresOnScreen()[0]).toContain('2');
    expect(scoresOnScreen()[1]).toContain('9');
  });

  it('spells the risk band out beside the score', async () => {
    mockApi({
      [PATH]: board([
        boardRow({
          latestObservation: observation({ score: score({ aggregate: 9, risk: 'high' }) }),
        }),
      ]),
    });

    show();

    await screen.findByRole('table');

    // Scoped to the row, because the counter above says "high" too. The band
    // is a word, not only a colour: if this ever becomes a coloured dot
    // alone, the board stops being readable in greyscale and this fails.
    const row = screen.getAllByRole('row')[1]!;

    expect(within(row).getByText('high')).toBeInTheDocument();
    expect(within(row).getByText('9')).toBeInTheDocument();
  });

  it('filters when a counter is pressed, and unfilters when it is pressed again', async () => {
    mockApi({
      [PATH]: board([
        boardRow({
          latestObservation: observation({ score: score({ aggregate: 9, risk: 'high' }) }),
        }),
        boardRow({
          latestObservation: observation({ score: score({ aggregate: 1, risk: 'low' }) }),
        }),
      ]),
    });

    show();
    await screen.findByRole('table');
    expect(scoresOnScreen()).toHaveLength(2);

    const highCounter = screen.getByRole('button', { name: /high/ });

    fireEvent.click(highCounter);
    expect(highCounter).toHaveAttribute('aria-pressed', 'true');
    expect(scoresOnScreen()).toHaveLength(1);

    fireEvent.click(highCounter);
    expect(highCounter).toHaveAttribute('aria-pressed', 'false');
    expect(scoresOnScreen()).toHaveLength(2);
  });

  it('finds a patient by name without asking the server again', async () => {
    const stub = mockApi({
      [PATH]: board([
        boardRow({ patient: { ...boardRow().patient, familyName: 'Quiroga', givenName: 'Hector' } }),
        boardRow({ patient: { ...boardRow().patient, familyName: 'Alvarez', givenName: 'Ana' } }),
      ]),
    });

    show();
    await screen.findByRole('table');

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'quiroga' } });

    expect(scoresOnScreen()).toHaveLength(1);
    expect(screen.getByText(/Quiroga/)).toBeInTheDocument();
    // Filtering is local. One request for the board, and no more.
    expect(stub.calls).toHaveLength(1);
  });

  it('counts one patient as a patient', async () => {
    mockApi({ [PATH]: board([boardRow()]) });

    show();

    expect(await screen.findByText(/^1 patient,/)).toBeInTheDocument();
  });

  it('says a patient has never been observed rather than showing a blank', async () => {
    mockApi({ [PATH]: board([boardRow({ latestObservation: null })]) });

    show();

    expect(await screen.findByText('never')).toBeInTheDocument();
    expect(screen.getByText('no score')).toBeInTheDocument();
  });

  it('shows an error instead of an empty table when the API fails', async () => {
    mockApiDown();

    show();

    expect(await screen.findByText(/Could not load/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
