import { describe, it, expect } from 'vitest';
import { LegacyServiceError } from '../legacy/legacy-client.js';
import { withRetry } from './retry.js';

function failing(kind: 'client-fault' | 'transport', failures: number) {
  let calls = 0;
  const fn = async () => {
    calls += 1;
    if (calls <= failures) throw new LegacyServiceError(kind, 'GetPatient', 'nope');
    return 'ok';
  };
  return { fn, calls: () => calls };
}

describe('withRetry', () => {
  it('recovers from a transient transport failure', async () => {
    const call = failing('transport', 2);
    await expect(withRetry(call.fn, { baseDelayMs: 1 })).resolves.toBe('ok');
    expect(call.calls()).toBe(3);
  });

  it('gives up after the last attempt', async () => {
    const call = failing('transport', 5);
    await expect(withRetry(call.fn, { attempts: 3, baseDelayMs: 1 })).rejects.toThrow(LegacyServiceError);
    expect(call.calls()).toBe(3);
  });

  it('never retries a client fault', async () => {
    const call = failing('client-fault', 1);
    await expect(withRetry(call.fn, { baseDelayMs: 1 })).rejects.toThrow(LegacyServiceError);
    expect(call.calls()).toBe(1);
  });
});
