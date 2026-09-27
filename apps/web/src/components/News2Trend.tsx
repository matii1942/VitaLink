/**
 * The NEWS2 score over time, as an inline SVG line.
 *
 * Drawn by hand rather than with a charting library. One series, twenty-odd
 * points, two reference lines — a library would be a dependency to install,
 * a bundle to ship and an API to learn, in exchange for about eighty lines.
 *
 * Design decisions worth stating, because a chart is read by people:
 *
 * One series means no legend; the heading names it. The line is thin and the
 * axes are recessive, so the data is the darkest thing in the frame.
 *
 * The thresholds at 5 and 7 are drawn as dashed hairlines with words beside
 * them, not as coloured bands. A nurse reading this needs to see where the
 * escalation line is, and a label says that unambiguously in any colour
 * vision, in greyscale, and on a printout.
 *
 * Time is on the horizontal axis to scale, not one step per observation.
 * Rounds are taken at irregular intervals — every four hours until somebody
 * deteriorates, then every hour — and evenly spacing them would flatten
 * exactly the acceleration that matters.
 *
 * The table underneath this chart carries the same numbers. That is the
 * accessible alternative, and it is not a fallback: it is where anybody
 * checking a specific value will look anyway.
 */
import { useId, useState } from 'react';

import type { ObservationView } from '../types';

const WIDTH = 720;
const HEIGHT = 200;
const PAD = { top: 14, right: 64, bottom: 26, left: 30 };

/** Where the risk bands begin. Drawn as lines, labelled as words. */
const THRESHOLDS = [
  { at: 5, label: 'medium' },
  { at: 7, label: 'high' },
];

export interface News2TrendProps {
  /** Oldest first. */
  observations: ObservationView[];
}

export function News2Trend({ observations }: News2TrendProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const titleId = useId();

  const points = observations
    .map((observation) => ({
      // The identifier, not the instant. Two rounds recorded in the same
      // minute are two different observations, and React needs a key that
      // says so — one that repeats makes it reuse or drop a mark.
      id: observation.observationId,
      at: new Date(observation.recordedAt).getTime(),
      score: observation.score?.aggregate ?? null,
      risk: observation.score?.risk ?? null,
      recordedAt: observation.recordedAt,
    }))
    .filter((point): point is typeof point & { score: number } => point.score !== null);

  if (points.length < 2) {
    return <p className="subtle">Not enough scored observations to draw a trend.</p>;
  }

  const first = points[0]!;
  const last = points[points.length - 1]!;
  const span = Math.max(1, last.at - first.at);
  const top = Math.max(8, ...points.map((point) => point.score));

  const x = (at: number) =>
    PAD.left + ((at - first.at) / span) * (WIDTH - PAD.left - PAD.right);
  const y = (score: number) =>
    PAD.top + (1 - score / top) * (HEIGHT - PAD.top - PAD.bottom);

  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.at)} ${y(point.score)}`).join(' ');
  const active = hovered === null ? null : points[hovered] ?? null;

  return (
    <figure className="chart">
      <figcaption id={titleId}>
        NEWS2 across {points.length} scored rounds, oldest on the left
      </figcaption>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-labelledby={titleId}
        onMouseLeave={() => setHovered(null)}
      >
        {THRESHOLDS.filter((threshold) => threshold.at <= top).map((threshold) => (
          <g key={threshold.at}>
            <line
              className="threshold"
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(threshold.at)}
              y2={y(threshold.at)}
            />
            <text className="threshold-label" x={WIDTH - PAD.right + 8} y={y(threshold.at) + 4}>
              {threshold.at} · {threshold.label}
            </text>
          </g>
        ))}

        <line
          className="axis"
          x1={PAD.left}
          x2={PAD.left}
          y1={PAD.top}
          y2={HEIGHT - PAD.bottom}
        />
        <text className="tick" textAnchor="end" x={PAD.left - 8} y={y(0) + 4}>
          0
        </text>
        <text className="tick" textAnchor="end" x={PAD.left - 8} y={y(top) + 4}>
          {top}
        </text>

        <path className="series" d={path} />

        {points.map((point, index) => (
          <circle
            key={point.id}
            className="marker"
            data-active={index === hovered}
            cx={x(point.at)}
            cy={y(point.score)}
            r={index === hovered ? 6 : 4}
          />
        ))}

        {/* Hit targets, wider than the markers and invisible: a 4px dot is
            not something anyone can reliably point at. */}
        {points.map((point, index) => (
          <rect
            key={`hit-${point.id}`}
            x={x(point.at) - 12}
            y={PAD.top}
            width={24}
            height={HEIGHT - PAD.top - PAD.bottom}
            fill="transparent"
            onMouseEnter={() => setHovered(index)}
          />
        ))}

        <text className="tick" textAnchor="start" x={PAD.left} y={HEIGHT - 8}>
          {shortTime(first.recordedAt)}
        </text>
        <text className="tick" x={WIDTH - PAD.right} y={HEIGHT - 8} textAnchor="end">
          {shortTime(last.recordedAt)}
        </text>

        {active !== null && (
          <g
            className="tooltip"
            transform={`translate(${Math.min(x(active.at) + 10, WIDTH - PAD.right - 110)}, ${Math.max(y(active.score) - 34, PAD.top)})`}
          >
            <rect width={150} height={34} rx={4} />
            <text x={8} y={14}>
              NEWS2 {active.score} · {active.risk ?? 'no band'}
            </text>
            <text x={8} y={27} className="tooltip-soft">
              {shortTime(active.recordedAt)}
            </text>
          </g>
        )}
      </svg>
    </figure>
  );
}

/** "27 Sep 06:00" — enough to place a round in a shift. */
function shortTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
