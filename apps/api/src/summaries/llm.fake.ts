/**
 * A language model that answers instantly, for free, and the same way twice.
 *
 * It lives beside the port rather than under test/ because both the unit
 * specs and the end-to-end harness use it, and because a double that sits
 * next to the interface it implements is a double that gets updated when the
 * interface changes. It is not wired into anything at run time: no module
 * provides it outside the tests, so esbuild drops it from the deployment
 * bundle — which the build's own weight report will show.
 *
 * The queue exists because the interesting cases are not "the model answers".
 * They are: the model answers with a number nobody gave it, the model refuses,
 * the provider times out. Each of those is one line to arrange here.
 */
import {
  LlmCallError,
  type LlmClient,
  type LlmRequest,
  type LlmResponse,
  type TokenPricing,
} from './llm.client.js';

type Reply = { kind: 'text'; text: string } | { kind: 'error'; error: Error };

export class FakeLlmClient implements LlmClient {
  readonly model: string = 'fake-model-1';

  /**
   * Round numbers, so a test that asserts on a cost can be read without a
   * calculator: one dollar per million tokens in, five out.
   */
  readonly pricing: TokenPricing = {
    inputMicroUsdPerMillion: 1_000_000,
    outputMicroUsdPerMillion: 5_000_000,
  };

  /** Every request received, in order. The tests assert on these. */
  readonly calls: LlmRequest[] = [];

  private readonly replies: Reply[] = [];

  /** The answer to give when the queue is empty. */
  private fallback = 'The patient is stable. No action required this shift.';

  /** Queue one answer. Call it repeatedly to script a sequence. */
  respondWith(text: string): this {
    this.replies.push({ kind: 'text', text });
    return this;
  }

  /** Queue one failure — a provider that is down, or a request refused. */
  failWith(error: Error): this {
    this.replies.push({ kind: 'error', error });
    return this;
  }

  /** Change what an unscripted call answers. */
  alwaysRespondWith(text: string): this {
    this.fallback = text;
    return this;
  }

  complete(request: LlmRequest): Promise<LlmResponse> {
    this.calls.push(request);

    const reply = this.replies.shift();

    if (reply?.kind === 'error') {
      return Promise.reject(reply.error);
    }

    const text = reply?.kind === 'text' ? reply.text : this.fallback;

    // Token counts derived from the text rather than invented, so a test that
    // checks the ledger is checking arithmetic and not a magic number. The
    // divisor matches estimateTokens, which keeps the worst-case estimate and
    // the reported usage in the same units.
    return Promise.resolve({
      text,
      model: this.model,
      inputTokens: Math.ceil((request.system.length + request.user.length) / 3),
      outputTokens: Math.ceil(text.length / 3),
    });
  }
}

/** A provider failure, ready to be queued. */
export function providerDown(): LlmCallError {
  return new LlmCallError('The provider returned 529.', 529);
}
