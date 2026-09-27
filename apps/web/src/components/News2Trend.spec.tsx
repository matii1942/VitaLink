import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { observation, resetFixtures, score } from '../fixtures';
import { News2Trend } from './News2Trend';

beforeEach(() => {
  resetFixtures();
});

describe('News2Trend', () => {
  it('refuses to draw a trend from a single point', () => {
    // A line through one point is not a trend; it is a decoration that looks
    // like evidence.
    render(<News2Trend observations={[observation()]} />);

    expect(screen.getByText(/Not enough scored observations/)).toBeInTheDocument();
  });

  it('ignores rounds the scorer could not score', () => {
    render(
      <News2Trend
        observations={[
          observation({ score: null }),
          observation({ score: null }),
          observation({ score: score({ aggregate: 3 }) }),
        ]}
      />,
    );

    // One scorable point out of three is still one point.
    expect(screen.getByText(/Not enough scored observations/)).toBeInTheDocument();
  });

  it('draws the thresholds with words beside them, not colour alone', () => {
    render(
      <News2Trend
        observations={[
          observation({ recordedAt: '2026-09-27T04:00:00.000Z', score: score({ aggregate: 1 }) }),
          observation({ recordedAt: '2026-09-27T08:00:00.000Z', score: score({ aggregate: 9 }) }),
        ]}
      />,
    );

    expect(screen.getByText('7 · high')).toBeInTheDocument();
    expect(screen.getByText('5 · medium')).toBeInTheDocument();
  });

  it('keeps both thresholds inside the frame when every score is low', () => {
    render(
      <News2Trend
        observations={[
          observation({ recordedAt: '2026-09-27T04:00:00.000Z', score: score({ aggregate: 0 }) }),
          observation({ recordedAt: '2026-09-27T08:00:00.000Z', score: score({ aggregate: 2 }) }),
        ]}
      />,
    );

    // The vertical axis has a floor of 8 for exactly this reason. Scaled to
    // the data alone, a ward of stable patients would push the escalation
    // line off the top of the frame — and a reader would see a flat trend
    // with no indication of how far it is from trouble.
    expect(screen.getByText('7 · high')).toBeInTheDocument();
  });

  it('names the number of rounds it drew', () => {
    render(
      <News2Trend
        observations={[
          observation({ recordedAt: '2026-09-27T04:00:00.000Z', score: score({ aggregate: 1 }) }),
          observation({ recordedAt: '2026-09-27T06:00:00.000Z', score: score({ aggregate: 4 }) }),
          observation({ recordedAt: '2026-09-27T08:00:00.000Z', score: score({ aggregate: 6 }) }),
        ]}
      />,
    );

    expect(screen.getByText(/NEWS2 across 3 scored rounds/)).toBeInTheDocument();
  });
});

describe('News2Trend keys', () => {
  it('draws two rounds recorded at the same instant without complaint', () => {
    // Two observations can share a timestamp; they cannot share an
    // identifier. Keying marks by the instant made React reuse one of them,
    // and the only symptom was a warning nobody was reading.
    const complaints = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <News2Trend
        observations={[
          observation({ observationId: 'OBS-A', recordedAt: '2026-09-27T08:00:00.000Z', score: score({ aggregate: 2 }) }),
          observation({ observationId: 'OBS-B', recordedAt: '2026-09-27T08:00:00.000Z', score: score({ aggregate: 6 }) }),
        ]}
      />,
    );

    expect(complaints).not.toHaveBeenCalled();
    complaints.mockRestore();
  });
});
