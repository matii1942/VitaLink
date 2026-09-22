import { LegacyServiceError } from '../legacy/legacy-client.js';

/**
 * Retries a call to the hospital, but only when retrying can help.
 *
 * A client fault — a patient that does not exist, a malformed date — fails
 * the same way every time, so it is thrown at once. A server fault or a
 * dropped connection gets up to `attempts` tries, with the wait doubling
 * between them so a struggling system is not hammered.
 */
export async function withRetry<T>(
  call: () => Promise<T>,
  { attempts = 3, baseDelayMs = 250 }: { attempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await call();
    } catch (error) {
      lastError = error;
      const retryable = error instanceof LegacyServiceError && error.retryable;
      if (!retryable || attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)));
    }
  }

  throw lastError;
}
