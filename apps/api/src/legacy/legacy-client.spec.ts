import { describe, it, expect } from 'vitest';
import {
  LegacyHospitalClient,
  LegacyServiceError,
  legacyClientConfigFromEnv,
} from './legacy-client.js';

// Calls against the running hospital simulator are integration tests and
// belong with the sync job. These cover what can be checked without it.

describe('legacyClientConfigFromEnv', () => {
  it('derives the endpoint by dropping the ?wsdl query', () => {
    expect(
      legacyClientConfigFromEnv({ LEGACY_SOAP_URL: 'http://localhost:8080/hospital?wsdl' }),
    ).toEqual({
      wsdlUrl: 'http://localhost:8080/hospital?wsdl',
      endpoint: 'http://localhost:8080/hospital',
    });
  });

  it('accepts the address without the query as well', () => {
    expect(legacyClientConfigFromEnv({ LEGACY_SOAP_URL: 'http://his.internal/hospital' }).endpoint).toBe(
      'http://his.internal/hospital',
    );
  });

  it('refuses to start without the variable', () => {
    expect(() => legacyClientConfigFromEnv({})).toThrow(/LEGACY_SOAP_URL/);
  });
});

describe('LegacyServiceError', () => {
  it('never retries a client fault — the request itself is wrong', () => {
    expect(new LegacyServiceError('client-fault', 'GetPatient', 'not found').retryable).toBe(false);
  });

  it('retries a server fault or a transport failure', () => {
    expect(new LegacyServiceError('server-fault', 'GetPatient', 'boom').retryable).toBe(true);
    expect(new LegacyServiceError('transport', 'GetPatient', 'refused').retryable).toBe(true);
  });
});

describe('LegacyHospitalClient', () => {
  it('reports an unreachable hospital as a retryable transport failure', async () => {
    // Port 1 is reserved and nothing listens on it: the connection is
    // refused at once, with no hospital and no network needed.
    const client = new LegacyHospitalClient({
      wsdlUrl: 'http://127.0.0.1:1/hospital?wsdl',
      endpoint: 'http://127.0.0.1:1/hospital',
    });

    const error = await client.getPatient('MRN-000001').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LegacyServiceError);
    expect((error as LegacyServiceError).kind).toBe('transport');
    expect((error as LegacyServiceError).retryable).toBe(true);
  });
});
