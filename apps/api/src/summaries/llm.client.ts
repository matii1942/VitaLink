/**
 * The port to a language model, and the arithmetic of what a call costs.
 *
 * Nothing above this file knows which provider is on the other side. That is
 * not architectural decoration: it is what lets the whole summary pipeline —
 * the fact sheet, the verification, the budget, the cache — be tested without
 * a network, without a key, and without spending a cent. The provider is one
 * class implementing one method, and it is the only part of Sprint 5 that
 * cannot be tested for free.
 */

/**
 * Nest resolves providers by type, and an interface has no type at run time
 * (see the note on `design:paramtypes` in the notebook). A symbol gives the
 * container something real to look up.
 */
export const LLM_CLIENT = Symbol('LLM_CLIENT');

export interface LlmRequest {
  /** The instructions. Stable across calls, and the cheapest part to cache. */
  system: string;
  /** The fact sheet for one admission. */
  user: string;
  /**
   * The hard ceiling on the answer.
   *
   * This is the only reason a call's cost can be bounded *before* making it.
   * Input tokens can be counted from text already in hand; output tokens
   * cannot be known in advance, so they are capped instead. Without a cap,
   * the budget gate would be a guess.
   */
  maxOutputTokens: number;
}

export interface LlmResponse {
  text: string;
  /** What actually answered. Recorded, never assumed: a provider may route. */
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * What a million tokens costs, in millionths of a United States dollar.
 *
 * Prices are configuration, not a constant compiled into the code. Providers
 * change them, and a stale number hard-coded here would silently make every
 * budget decision wrong while looking perfectly correct.
 */
export interface TokenPricing {
  inputMicroUsdPerMillion: number;
  outputMicroUsdPerMillion: number;
}

export interface LlmClient {
  /** The model this client will ask for. */
  readonly model: string;
  readonly pricing: TokenPricing;
  complete(request: LlmRequest): Promise<LlmResponse>;
}

/** Raised when the provider answers with anything other than a completion. */
export class LlmCallError extends Error {
  constructor(
    message: string,
    /** The provider's status code, when the failure came back over HTTP. */
    readonly status?: number,
  ) {
    super(message);
    this.name = 'LlmCallError';
  }
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * What a call cost, in millionths of a dollar, as a whole number.
 *
 * Each side is rounded up on its own. Rounding up is deliberate: this figure
 * is compared against a spending limit, and the only safe direction to be
 * wrong about money is the direction that stops sooner. Rounding the two
 * sides separately costs at most two millionths of a dollar per call and
 * keeps each one independently checkable against the provider's invoice.
 */
export function costOf(usage: TokenUsage, pricing: TokenPricing): number {
  return (
    Math.ceil((usage.inputTokens * pricing.inputMicroUsdPerMillion) / 1_000_000) +
    Math.ceil((usage.outputTokens * pricing.outputMicroUsdPerMillion) / 1_000_000)
  );
}

/**
 * The most a call can possibly cost, given the prompt already written and the
 * ceiling on the answer.
 *
 * The input side is an estimate — the provider's tokeniser is not ours — so it
 * is deliberately pessimistic (see `estimateTokens`). The output side is not
 * an estimate at all: it is the cap the request will carry.
 */
export function worstCaseCostOf(
  request: LlmRequest,
  pricing: TokenPricing,
): number {
  return costOf(
    {
      inputTokens: estimateTokens(request.system) + estimateTokens(request.user),
      outputTokens: request.maxOutputTokens,
    },
    pricing,
  );
}

/**
 * A pessimistic token count for a piece of text.
 *
 * Three characters per token. The usual rule of thumb is four, and this is
 * not a mistake: the fact sheet is mostly digits, punctuation and short
 * clinical codes, which tokenise worse than prose. The number only ever
 * decides whether to *refuse* a call, and the provider's real count is what
 * gets written to the ledger afterwards, so an overestimate here spends
 * nothing — it just makes the last call before the limit arrive slightly
 * earlier than it strictly had to.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}
