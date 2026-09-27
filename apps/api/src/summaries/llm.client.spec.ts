import { describe, expect, it } from 'vitest';

import { costOf, estimateTokens, worstCaseCostOf, type TokenPricing } from './llm.client.js';

/** One dollar per million in, five per million out. */
const pricing: TokenPricing = {
  inputMicroUsdPerMillion: 1_000_000,
  outputMicroUsdPerMillion: 5_000_000,
};

describe('costOf', () => {
  it('charges each side at its own rate', () => {
    // A million in at $1 plus a million out at $5 is $6, which is six million
    // millionths.
    expect(costOf({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, pricing)).toBe(6_000_000);
  });

  it('rounds each side up, never down', () => {
    // A single token costs one millionth of a dollar at this price, and a
    // hundred of them cost a hundred — but one token at a price that does not
    // divide evenly must still cost something. A budget that rounds fractions
    // of a cent down never reaches its limit.
    const cheap: TokenPricing = { inputMicroUsdPerMillion: 1, outputMicroUsdPerMillion: 1 };

    expect(costOf({ inputTokens: 1, outputTokens: 1 }, cheap)).toBe(2);
  });

  it('costs nothing when nothing was sent', () => {
    expect(costOf({ inputTokens: 0, outputTokens: 0 }, pricing)).toBe(0);
  });
});

describe('estimateTokens', () => {
  it('assumes three characters to a token', () => {
    expect(estimateTokens('abcdef')).toBe(2);
  });

  it('rounds a partial token up', () => {
    expect(estimateTokens('abcd')).toBe(2);
  });

  it('counts nothing as nothing', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

describe('worstCaseCostOf', () => {
  it('prices the output at the cap, not at a guess', () => {
    const cost = worstCaseCostOf(
      { system: 'abc', user: 'def', maxOutputTokens: 1_000 },
      pricing,
    );

    // Two tokens of input at $1 per million, plus the full thousand-token
    // ceiling at $5 per million: 2 + 5000 millionths.
    expect(cost).toBe(5_002);
  });

  it('never returns less than the call will actually cost', () => {
    // The guarantee the budget gate leans on: whatever comes back, it cannot
    // cost more than what was estimated before the call. The real answer is
    // shorter than the cap and the real input count is no worse than three
    // characters to a token.
    const request = { system: 'system prompt here', user: 'the fact sheet', maxOutputTokens: 400 };
    const estimate = worstCaseCostOf(request, pricing);
    const actual = costOf({ inputTokens: 8, outputTokens: 120 }, pricing);

    expect(actual).toBeLessThanOrEqual(estimate);
  });
});
