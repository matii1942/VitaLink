/**
 * The one part of Sprint 5 that cannot be tested for free.
 *
 * Written against `fetch` rather than the provider's software development
 * kit, on purpose. The kit would be a dependency for one POST with three
 * headers, and this project has already measured what a dependency costs: the
 * deployment bundle is 8.7 megabytes, more than half of it the database
 * client, and the Lambda pays for that on every cold start. Node has had
 * fetch built in since version 18.
 *
 * Everything here that could be wrong shows up as a 401 or a 400 on the very
 * first real call, loudly, which is the right way for an integration to fail.
 */
import { Injectable } from '@nestjs/common';

import {
  LlmCallError,
  type LlmClient,
  type LlmRequest,
  type LlmResponse,
  type TokenPricing,
} from './llm.client.js';
import { LlmConfig } from './llm.config.js';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';

/**
 * The wire format version. Not the model version: this pins the shape of the
 * request and the response, so a change at the provider cannot silently
 * rearrange the fields this file reads.
 */
const API_VERSION = '2023-06-01';

/**
 * Longer than any answer this short should need, shorter than the Lambda's
 * own limit. Without it a hung connection would hold the function open until
 * the platform killed it, and the ledger would never learn the call happened.
 */
const TIMEOUT_MS = 20_000;

interface MessagesResponse {
  content?: Array<{ type?: string; text?: string }>;
  model?: string;
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

@Injectable()
export class AnthropicClient implements LlmClient {
  constructor(private readonly config: LlmConfig) {}

  get model(): string {
    return this.config.model;
  }

  get pricing(): TokenPricing {
    return this.config.pricing;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // The long-standing header for an API key. Bearer authorisation is
        // also accepted; if this ever answers 401 with a key that works
        // elsewhere, that is the first thing to try.
        'x-api-key': this.config.apiKey,
        'anthropic-version': API_VERSION,
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: request.maxOutputTokens,
        system: request.system,
        messages: [{ role: 'user', content: request.user }],
        // Zero, because two nurses reading the same chart should get the same
        // handover note. Variety is a virtue in prose and a defect here.
        temperature: 0,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      // The body of an error carries the reason — an invalid key, a model
      // name that no longer exists, a rate limit. Swallowing it would turn a
      // five-second fix into an afternoon.
      throw new LlmCallError(
        `The provider answered ${response.status}: ${(await response.text()).slice(0, 500)}`,
        response.status,
      );
    }

    const body = (await response.json()) as MessagesResponse;

    if (body.stop_reason === 'max_tokens') {
      // A note cut off mid-sentence would pass verification — every figure in
      // it is real — and arrive at a shift change missing its conclusion.
      throw new LlmCallError('The answer hit the output ceiling and was truncated.');
    }

    const text = (body.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('')
      .trim();

    if (text === '') {
      throw new LlmCallError(`The provider returned no text (stop reason: ${body.stop_reason}).`);
    }

    return {
      text,
      // What answered, as reported, rather than what was asked for.
      model: body.model ?? this.config.model,
      inputTokens: body.usage?.input_tokens ?? 0,
      outputTokens: body.usage?.output_tokens ?? 0,
    };
  }
}
