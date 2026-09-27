/**
 * Everything about the model that is a setting rather than a decision.
 *
 * Prices live here, read from the environment, because they are the
 * provider's business and they change. A price compiled into the source would
 * keep every budget calculation looking correct long after it had become
 * wrong — the worst kind of bug, because nothing fails.
 *
 * The defaults are the published list price of the smallest model, in United
 * States dollars per million tokens, checked on 27 September 2026. They are
 * defaults, not facts: `docs/decisions/0014` records where to look them up.
 */
import { Injectable } from '@nestjs/common';

import type { TokenPricing } from './llm.client.js';

/** Millionths of a dollar in one dollar. */
export const MICRO_USD_PER_USD = 1_000_000;

@Injectable()
export class LlmConfig {
  /** Empty when no key is configured — the service then serves no summaries. */
  readonly apiKey: string = read('ANTHROPIC_API_KEY', '');

  readonly model: string = read('LLM_MODEL', 'claude-haiku-4-5');

  /** The self-imposed cap for a calendar month, in millionths of a dollar. */
  readonly monthlyBudgetMicroUsd: number = Math.round(
    readNumber('LLM_MONTHLY_BUDGET_USD', 5) * MICRO_USD_PER_USD,
  );

  readonly pricing: TokenPricing = {
    inputMicroUsdPerMillion: Math.round(
      readNumber('LLM_INPUT_USD_PER_MTOK', 1) * MICRO_USD_PER_USD,
    ),
    outputMicroUsdPerMillion: Math.round(
      readNumber('LLM_OUTPUT_USD_PER_MTOK', 5) * MICRO_USD_PER_USD,
    ),
  };

  /**
   * The ceiling on an answer. Five sentences of clinical prose fit in far
   * less; this leaves room without leaving the door open.
   */
  readonly maxOutputTokens: number = readNumber('LLM_MAX_OUTPUT_TOKENS', 300);

  /**
   * How many rounds of observations go into a fact sheet.
   *
   * Six rounds is roughly a full day at the four-hourly rhythm of a general
   * ward, which is the window a handover actually covers. It is also the
   * single biggest lever on cost: doubling it doubles the input tokens of
   * every call for information nobody reads at a shift change.
   */
  readonly observationRounds: number = readNumber('LLM_OBSERVATION_ROUNDS', 6);

  get configured(): boolean {
    return this.apiKey.length > 0;
  }
}

function read(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? fallback : value.trim();
}

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];

  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }

  const parsed = Number(raw);

  // A malformed price would be worse than no price: Number('') is 0, and a
  // budget divided by a cost of zero never stops.
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative number, got "${raw}".`);
  }

  return parsed;
}
