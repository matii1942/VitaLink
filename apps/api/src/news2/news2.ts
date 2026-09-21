/**
 * The NEWS2 scoring engine.
 *
 * A direct transcription of the Royal College of Physicians' NEWS2 chart
 * (2017), verified row by row against independent sources. See ADR 0005.
 *
 * This module is deliberately pure: vital signs in, score out. No database,
 * no network, no clock. That is what makes it possible to test every band
 * boundary exhaustively, and this is the one place in the system where a
 * wrong answer means a patient assessed wrongly.
 *
 * Reading the bands: each is inclusive of its upper bound, so the chart's
 * "12–20" is `rate <= 20` once the lower bands have been ruled out. The chart
 * is not symmetric — hypothermia can score 3 but fever stops at 2, and a low
 * respiratory rate never scores 2 — so every parameter has its own function
 * and none is derived from another.
 */

import type { News2Scale } from '../domain/clinical.js';

/** Alert, new Confusion, responds to Voice, responds to Pain, Unresponsive. */
export type Acvpu = 'A' | 'C' | 'V' | 'P' | 'U';

export type News2Parameter =
  | 'respirationRate'
  | 'oxygenSaturation'
  | 'supplementalOxygen'
  | 'systolicBP'
  | 'pulse'
  | 'consciousness'
  | 'temperature';

export type ClinicalRisk = 'low' | 'low-medium' | 'medium' | 'high';

export interface News2Input {
  respirationRate: number | null;
  oxygenSaturation: number | null;
  /** Always known: the source records the respiratory support of every observation. */
  onOxygen: boolean;
  systolicBP: number | null;
  pulse: number | null;
  consciousness: Acvpu | null;
  temperature: number | null;
  /** Already resolved by the caller. The engine never chooses a scale (ADR 0003). */
  scale: News2Scale;
}

export interface News2Result {
  /** Sum of the parameters that could be scored. */
  aggregate: number;
  /** Per-parameter score; null where the measurement was missing. */
  parameters: Record<News2Parameter, number | null>;
  /** Parameters that could not be scored. */
  missing: News2Parameter[];
  /** True when any parameter is missing: the aggregate is a lower bound. */
  partial: boolean;
  /** True when any single parameter scored 3 — the chart's "red score". */
  redScore: boolean;
  risk: ClinicalRisk;
}

// ---------------------------------------------------------------------------
// One function per row of the chart
// ---------------------------------------------------------------------------

/** ≤8: 3 · 9–11: 1 · 12–20: 0 · 21–24: 2 · ≥25: 3 */
export function scoreRespirationRate(rate: number): number {
  if (rate <= 8) return 3;
  if (rate <= 11) return 1;
  if (rate <= 20) return 0;
  if (rate <= 24) return 2;
  return 3;
}

/** Scale 1 — ≤91: 3 · 92–93: 2 · 94–95: 1 · ≥96: 0 */
export function scoreSpO2Scale1(saturation: number): number {
  if (saturation <= 91) return 3;
  if (saturation <= 93) return 2;
  if (saturation <= 95) return 1;
  return 0;
}

/**
 * Scale 2 — for chronic hypercapnic respiratory failure, target 88–92%.
 *
 * ≤83: 3 · 84–85: 2 · 86–87: 1 · 88–92: 0
 * ≥93 on air: 0 · 93–94 on oxygen: 1 · 95–96 on oxygen: 2 · ≥97 on oxygen: 3
 *
 * Above the target the score depends on oxygen as well as saturation. A high
 * saturation reached on supplemental oxygen is penalised because, for these
 * patients, over-oxygenation causes harm; the same saturation on room air
 * does not.
 */
export function scoreSpO2Scale2(saturation: number, onOxygen: boolean): number {
  if (saturation <= 83) return 3;
  if (saturation <= 85) return 2;
  if (saturation <= 87) return 1;
  if (saturation <= 92) return 0;
  if (!onOxygen) return 0;
  if (saturation <= 94) return 1;
  if (saturation <= 96) return 2;
  return 3;
}

/** Air: 0 · Oxygen: 2. Applies on both scales. */
export function scoreSupplementalOxygen(onOxygen: boolean): number {
  return onOxygen ? 2 : 0;
}

/** ≤90: 3 · 91–100: 2 · 101–110: 1 · 111–219: 0 · ≥220: 3 */
export function scoreSystolicBP(pressure: number): number {
  if (pressure <= 90) return 3;
  if (pressure <= 100) return 2;
  if (pressure <= 110) return 1;
  if (pressure <= 219) return 0;
  return 3;
}

/** ≤40: 3 · 41–50: 1 · 51–90: 0 · 91–110: 1 · 111–130: 2 · ≥131: 3 */
export function scorePulse(rate: number): number {
  if (rate <= 40) return 3;
  if (rate <= 50) return 1;
  if (rate <= 90) return 0;
  if (rate <= 110) return 1;
  if (rate <= 130) return 2;
  return 3;
}

/** Alert: 0 · C, V, P or U: 3 */
export function scoreConsciousness(level: Acvpu): number {
  return level === 'A' ? 0 : 3;
}

/** ≤35.0: 3 · 35.1–36.0: 1 · 36.1–38.0: 0 · 38.1–39.0: 1 · ≥39.1: 2 */
export function scoreTemperature(celsius: number): number {
  if (celsius <= 35.0) return 3;
  if (celsius <= 36.0) return 1;
  if (celsius <= 38.0) return 0;
  if (celsius <= 39.0) return 1;
  return 2;
}

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

/**
 * Chart 2. A red score raises a low aggregate to low–medium, but never lowers
 * a medium or high one: the risk is the more severe of the two.
 */
export function classifyRisk(aggregate: number, redScore: boolean): ClinicalRisk {
  if (aggregate >= 7) return 'high';
  if (aggregate >= 5) return 'medium';
  if (redScore) return 'low-medium';
  return 'low';
}

function scoreIfPresent<T>(value: T | null, score: (value: T) => number): number | null {
  return value === null ? null : score(value);
}

export function calculateNews2(input: News2Input): News2Result {
  const parameters: Record<News2Parameter, number | null> = {
    respirationRate: scoreIfPresent(input.respirationRate, scoreRespirationRate),
    oxygenSaturation: scoreIfPresent(input.oxygenSaturation, (saturation) =>
      input.scale === 2
        ? scoreSpO2Scale2(saturation, input.onOxygen)
        : scoreSpO2Scale1(saturation),
    ),
    supplementalOxygen: scoreSupplementalOxygen(input.onOxygen),
    systolicBP: scoreIfPresent(input.systolicBP, scoreSystolicBP),
    pulse: scoreIfPresent(input.pulse, scorePulse),
    consciousness: scoreIfPresent(input.consciousness, scoreConsciousness),
    temperature: scoreIfPresent(input.temperature, scoreTemperature),
  };

  const entries = Object.entries(parameters) as Array<[News2Parameter, number | null]>;
  const missing = entries.filter(([, score]) => score === null).map(([name]) => name);
  const scores = entries.map(([, score]) => score).filter((score): score is number => score !== null);

  const aggregate = scores.reduce((sum, score) => sum + score, 0);
  const redScore = scores.includes(3);

  return {
    aggregate,
    parameters,
    missing,
    partial: missing.length > 0,
    redScore,
    risk: classifyRisk(aggregate, redScore),
  };
}
