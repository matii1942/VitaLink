import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import soap from 'soap';
import serverModule from '../src/server.js';

let server;
let client;

beforeAll(async () => {
  // Port 0 lets the OS pick a free port, so the test never collides with a
  // simulator already running on 8080 — locally or in CI.
  const started = await serverModule.start({ port: 0 });
  server = started.server;

  client = await soap.createClientAsync(`${started.url}?wsdl`);

  // The WSDL hard-codes http://localhost:8080. The real address has to come
  // from configuration, never from the contract.
  client.setEndpoint(started.url);
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

describe('GetPatient', () => {
  it('returns the patient in legacy format', async () => {
    const [result] = await client.GetPatientAsync({ mrn: 'MRN-000001' });

    expect(result.patient.mrn).toBe('MRN-000001');
    expect(result.patient.birthDate).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(['M', 'F', '1', '2', 'U']).toContain(result.patient.sexCode);
  });

  it('answers an unknown MRN with a SOAP client fault', async () => {
    let fault;
    try {
      await client.GetPatientAsync({ mrn: 'MRN-999999' });
    } catch (error) {
      fault = error;
    }

    expect(fault).toBeDefined();
    expect(fault.response.status).toBe(500);
    expect(String(fault.body)).toContain('soap:Client');
    expect(String(fault.body)).toContain('Patient not found: MRN-999999');
  });
});

describe('ListAdmissions', () => {
  it('returns only admissions with no discharge when activeOnly is S', async () => {
    const [result] = await client.ListAdmissionsAsync({ ward: null, activeOnly: 'S' });
    const admissions = [].concat(result.admissions.admission ?? []);

    expect(admissions.length).toBeGreaterThan(0);
    for (const a of admissions) {
      // A null comes back from node-soap as { attributes: { 'xsi:nil': 'true' } },
      // not as null — the consumer has to handle that explicitly.
      expect(a.dischargedAt?.attributes?.['xsi:nil']).toBe('true');
    }
  });
});

describe('GetObservations', () => {
  it('sends temperatures with a comma decimal on the wire', async () => {
    await client.GetObservationsAsync({ admissionId: 'ADM-000001', since: null });
    expect(client.lastResponse).toMatch(/<temperature>\d{2},\d<\/temperature>/);
  });

  it('rejects a since date in the wrong format', async () => {
    let fault;
    try {
      await client.GetObservationsAsync({ admissionId: 'ADM-000001', since: '2026-09-20' });
    } catch (error) {
      fault = error;
    }

    expect(String(fault?.body)).toContain('Invalid date');
  });

  it('answers an unknown admission with a client fault', async () => {
    let fault;
    try {
      await client.GetObservationsAsync({ admissionId: 'ADM-999999', since: null });
    } catch (error) {
      fault = error;
    }

    expect(String(fault?.body)).toContain('Admission not found');
  });
});
