/**
 * The SOAP client for the hospital's legacy system.
 *
 * It returns records exactly as the wire delivers them — LegacyPatient and
 * friends, xsi:nil objects and all. Normalising is not its job; keeping the
 * two apart means this class only knows about SOAP, and normalize.ts only
 * knows about the data.
 *
 * Two lessons from the simulator are built in:
 *
 *  - The endpoint comes from configuration, never from the WSDL. The WSDL's
 *    <soap:address> is whatever the hospital's system was installed with,
 *    and is routinely unreachable from anywhere else.
 *
 *  - A SOAP fault arrives as HTTP 500, but a 500 is not necessarily an
 *    outage. soap:Client means our request was wrong and retrying will
 *    never help; only a server fault or a transport failure is worth a
 *    retry. The error says which it was.
 */

// soap is a CommonJS package. From an ES module it is imported through its
// default export, which is the whole of module.exports.
import soap from 'soap';
import type { Client } from 'soap';

import type { LegacyAdmission, LegacyObservation, LegacyPatient } from './legacy.types.js';
import { toList } from './normalize.js';

export interface LegacyClientConfig {
  /** Where to fetch the contract, e.g. http://localhost:8080/hospital?wsdl */
  wsdlUrl: string;
  /** Where to send requests, e.g. http://localhost:8080/hospital */
  endpoint: string;
}

/**
 * Builds the configuration from LEGACY_SOAP_URL. The variable holds the WSDL
 * address; the endpoint is the same address without the ?wsdl query.
 */
export function legacyClientConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LegacyClientConfig {
  const raw = env['LEGACY_SOAP_URL'];
  if (!raw) throw new Error('LEGACY_SOAP_URL is not set');

  const url = new URL(raw);
  const endpoint = `${url.origin}${url.pathname}`;
  return { wsdlUrl: `${endpoint}?wsdl`, endpoint };
}

export type LegacyFailureKind = 'client-fault' | 'server-fault' | 'transport';

export class LegacyServiceError extends Error {
  constructor(
    readonly kind: LegacyFailureKind,
    readonly operation: string,
    message: string,
  ) {
    super(`${operation}: ${message}`);
    this.name = 'LegacyServiceError';
  }

  /** Only a server-side fault or a network failure can succeed on a retry. */
  get retryable(): boolean {
    return this.kind !== 'client-fault';
  }
}

interface SoapError {
  body?: unknown;
  response?: { status?: number };
  message?: string;
}

function classify(operation: string, error: unknown): LegacyServiceError {
  const e = error as SoapError;
  const body = typeof e.body === 'string' ? e.body : '';
  const faultString = /<faultstring>([^<]*)<\/faultstring>/.exec(body)?.[1];

  if (/<faultcode>[^<]*Client<\/faultcode>/.test(body)) {
    return new LegacyServiceError('client-fault', operation, faultString ?? 'client fault');
  }
  if (/<faultcode>[^<]*Server<\/faultcode>/.test(body) || e.response?.status) {
    return new LegacyServiceError('server-fault', operation, faultString ?? `HTTP ${e.response?.status}`);
  }
  return new LegacyServiceError('transport', operation, e.message ?? 'no response');
}

export class LegacyHospitalClient {
  private client: Promise<Client> | null = null;

  constructor(private readonly config: LegacyClientConfig) {}

  /** Fetches and parses the WSDL once, on first use. */
  private connect(): Promise<Client> {
    this.client ??= soap.createClientAsync(this.config.wsdlUrl).then((client) => {
      client.setEndpoint(this.config.endpoint);
      return client;
    });
    return this.client;
  }

  private async call<T>(operation: string, args: Record<string, unknown>): Promise<T> {
    let client: Client;
    try {
      client = await this.connect();
    } catch (error) {
      this.client = null; // let the next call try again
      throw classify('connect', error);
    }

    try {
      const [result] = (await client[`${operation}Async`](args)) as [T];
      return result;
    } catch (error) {
      throw classify(operation, error);
    }
  }

  async getPatient(mrn: string): Promise<LegacyPatient> {
    const result = await this.call<{ patient: LegacyPatient }>('GetPatient', { mrn });
    return result.patient;
  }

  async listAdmissions(options: { ward?: string; activeOnly?: boolean } = {}): Promise<LegacyAdmission[]> {
    const result = await this.call<{ admissions: { admission?: LegacyAdmission | LegacyAdmission[] } | null }>(
      'ListAdmissions',
      { ward: options.ward ?? null, activeOnly: options.activeOnly ? 'S' : 'N' },
    );
    return toList(result.admissions?.admission);
  }

  /**
   * @param since optional, already in the hospital's DD/MM/YYYY HH:MM format
   */
  async getObservations(admissionId: string, since?: string): Promise<LegacyObservation[]> {
    const result = await this.call<{ observations: { observation?: LegacyObservation | LegacyObservation[] } | null }>(
      'GetObservations',
      { admissionId, since: since ?? null },
    );
    return toList(result.observations?.observation);
  }
}
