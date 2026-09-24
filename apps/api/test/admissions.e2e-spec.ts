/**
 * GET /admissions and GET /admissions/:admissionId/observations.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { createTestApp, type TestApp } from './helpers/app.js';
import { seedAdmission, seedObservation, seedPatient, seedScore } from './helpers/seed.js';

describe('GET /admissions', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  beforeEach(async () => {
    await testApp.reset();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('answers with an empty page when there are no admissions', async () => {
    const { body } = await request(testApp.server).get('/admissions').expect(200);

    expect(body).toEqual({ data: [], page: 1, pageSize: 25, total: 0, totalPages: 0 });
  });

  it('brings the patient along, without their identity number', async () => {
    const patient = await seedPatient(testApp.prisma, {
      familyName: 'Quiroga',
      givenName: 'Hector',
      nationalId: '12345678',
    });
    await seedAdmission(testApp.prisma, { mrn: patient.mrn });

    const { body } = await request(testApp.server).get('/admissions').expect(200);

    expect(body.data[0].patient).toMatchObject({
      mrn: patient.mrn,
      familyName: 'Quiroga',
      givenName: 'Hector',
    });
    expect(body.data[0].patient).not.toHaveProperty('nationalId');
    expect(JSON.stringify(body)).not.toContain('12345678');
  });

  it('counts the observations of each admission', async () => {
    const patient = await seedPatient(testApp.prisma);
    const admission = await seedAdmission(testApp.prisma, { mrn: patient.mrn });
    await seedObservation(testApp.prisma, { admissionId: admission.admissionId });
    await seedObservation(testApp.prisma, { admissionId: admission.admissionId });
    await seedObservation(testApp.prisma, { admissionId: admission.admissionId });

    const { body } = await request(testApp.server).get('/admissions').expect(200);

    expect(body.data[0].observationCount).toBe(3);
  });

  it('shows the most recently admitted first', async () => {
    const patient = await seedPatient(testApp.prisma);
    const older = await seedAdmission(testApp.prisma, {
      mrn: patient.mrn,
      admittedAt: new Date('2026-01-05T07:00:00.000Z'),
    });
    const newer = await seedAdmission(testApp.prisma, {
      mrn: patient.mrn,
      admittedAt: new Date('2026-09-15T19:40:00.000Z'),
    });

    const { body } = await request(testApp.server).get('/admissions').expect(200);

    expect(body.data.map((a: { admissionId: string }) => a.admissionId)).toEqual([
      newer.admissionId,
      older.admissionId,
    ]);
  });

  it('filters by ward', async () => {
    const patient = await seedPatient(testApp.prisma);
    await seedAdmission(testApp.prisma, { mrn: patient.mrn, ward: 'surgery' });
    await seedAdmission(testApp.prisma, { mrn: patient.mrn, ward: 'cardiology' });

    const { body } = await request(testApp.server)
      .get('/admissions?ward=cardiology')
      .expect(200);

    expect(body.total).toBe(1);
    expect(body.data[0].ward).toBe('cardiology');
  });

  it('treats an empty ward filter as no filter at all', async () => {
    const patient = await seedPatient(testApp.prisma);
    await seedAdmission(testApp.prisma, { mrn: patient.mrn, ward: 'surgery' });

    const { body } = await request(testApp.server).get('/admissions?ward=').expect(200);

    expect(body.total).toBe(1);
  });

  it('filters by whether the patient is still in a bed', async () => {
    const patient = await seedPatient(testApp.prisma);
    const open = await seedAdmission(testApp.prisma, { mrn: patient.mrn, dischargedAt: null });
    const closed = await seedAdmission(testApp.prisma, {
      mrn: patient.mrn,
      dischargedAt: new Date('2026-09-10T13:00:00.000Z'),
    });

    const active = await request(testApp.server).get('/admissions?active=true').expect(200);
    expect(active.body.data.map((a: { admissionId: string }) => a.admissionId)).toEqual([
      open.admissionId,
    ]);
    expect(active.body.data[0].active).toBe(true);

    const discharged = await request(testApp.server).get('/admissions?active=false').expect(200);
    expect(discharged.body.data.map((a: { admissionId: string }) => a.admissionId)).toEqual([
      closed.admissionId,
    ]);
    expect(discharged.body.data[0].active).toBe(false);

    const both = await request(testApp.server).get('/admissions').expect(200);
    expect(both.body.total).toBe(2);
  });

  it('combines the two filters', async () => {
    const patient = await seedPatient(testApp.prisma);
    await seedAdmission(testApp.prisma, { mrn: patient.mrn, ward: 'surgery', dischargedAt: null });
    await seedAdmission(testApp.prisma, {
      mrn: patient.mrn,
      ward: 'surgery',
      dischargedAt: new Date('2026-09-10T13:00:00.000Z'),
    });
    await seedAdmission(testApp.prisma, {
      mrn: patient.mrn,
      ward: 'cardiology',
      dischargedAt: null,
    });

    const { body } = await request(testApp.server)
      .get('/admissions?ward=surgery&active=true')
      .expect(200);

    expect(body.total).toBe(1);
    expect(body.data[0]).toMatchObject({ ward: 'surgery', active: true });
  });

  it('refuses a filter it cannot interpret', async () => {
    await request(testApp.server).get('/admissions?active=maybe').expect(400);
    await request(testApp.server).get('/admissions?pageSize=0').expect(400);
  });
});

describe('GET /admissions/:admissionId/observations', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  beforeEach(async () => {
    await testApp.reset();
  });

  afterAll(async () => {
    await testApp.close();
  });

  /** An admission with three rounds of vital signs, an hour apart. */
  async function anAdmissionWithThreeRounds(): Promise<string> {
    const patient = await seedPatient(testApp.prisma);
    const admission = await seedAdmission(testApp.prisma, { mrn: patient.mrn });

    for (const hour of ['08', '09', '10']) {
      await seedObservation(testApp.prisma, {
        admissionId: admission.admissionId,
        observationId: `OBS-${hour}`,
        recordedAt: new Date(`2026-09-15T${hour}:00:00.000Z`),
      });
    }

    return admission.admissionId;
  }

  it('answers 404 for an admission that does not exist', async () => {
    const { body } = await request(testApp.server)
      .get('/admissions/ADM-nope/observations')
      .expect(404);

    expect(body.message).toContain('ADM-nope');
  });

  it('answers with an empty page for an admission with no observations', async () => {
    const patient = await seedPatient(testApp.prisma);
    const admission = await seedAdmission(testApp.prisma, { mrn: patient.mrn });

    const { body } = await request(testApp.server)
      .get(`/admissions/${admission.admissionId}/observations`)
      .expect(200);

    expect(body).toMatchObject({ data: [], total: 0 });
  });

  it('sends the most recent round first, and ascending on request', async () => {
    const admissionId = await anAdmissionWithThreeRounds();

    const newestFirst = await request(testApp.server)
      .get(`/admissions/${admissionId}/observations`)
      .expect(200);
    expect(newestFirst.body.data.map((o: { observationId: string }) => o.observationId)).toEqual([
      'OBS-10',
      'OBS-09',
      'OBS-08',
    ]);

    const chronological = await request(testApp.server)
      .get(`/admissions/${admissionId}/observations?order=asc`)
      .expect(200);
    expect(chronological.body.data.map((o: { observationId: string }) => o.observationId)).toEqual([
      'OBS-08',
      'OBS-09',
      'OBS-10',
    ]);
  });

  it('refuses an order it does not know', async () => {
    const admissionId = await anAdmissionWithThreeRounds();

    await request(testApp.server)
      .get(`/admissions/${admissionId}/observations?order=sideways`)
      .expect(400);
  });

  it('pages through the rounds', async () => {
    const admissionId = await anAdmissionWithThreeRounds();

    const { body } = await request(testApp.server)
      .get(`/admissions/${admissionId}/observations?page=2&pageSize=2`)
      .expect(200);

    expect(body).toMatchObject({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    expect(body.data.map((o: { observationId: string }) => o.observationId)).toEqual(['OBS-08']);
  });

  it('nests the Glasgow components and the NEWS2 chart rows', async () => {
    const patient = await seedPatient(testApp.prisma);
    const admission = await seedAdmission(testApp.prisma, { mrn: patient.mrn });
    const observation = await seedObservation(testApp.prisma, {
      admissionId: admission.admissionId,
      respirationRate: 22,
      oxygenSaturation: 94,
      respiratorySupport: 'cannula',
      temperature: 38.2,
      gcsEye: 4,
      gcsVerbal: 4,
      gcsMotor: 6,
      gcsTotal: 14,
    });
    await seedScore(testApp.prisma, {
      observationId: observation.observationId,
      aggregate: 8,
      risk: 'medium',
      respirationRateScore: 2,
      oxygenSaturationScore: 1,
      supplementalOxygenScore: 2,
      consciousnessScore: 3,
      temperatureScore: 0,
    });

    const { body } = await request(testApp.server)
      .get(`/admissions/${admission.admissionId}/observations`)
      .expect(200);

    const view = body.data[0];

    expect(view.glasgow).toEqual({ eye: 4, verbal: 4, motor: 6, total: 14 });
    expect(view).not.toHaveProperty('gcsTotal');

    expect(view.score).toMatchObject({
      status: 'scored',
      aggregate: 8,
      risk: 'medium',
      partial: false,
      scaleUsed: 1,
      scaleSource: 'recorded',
      missing: [],
    });

    expect(view.score.parameters).toEqual({
      respirationRate: 2,
      oxygenSaturation: 1,
      supplementalOxygen: 2,
      systolicBP: 0,
      pulse: 0,
      consciousness: 3,
      temperature: 0,
    });
  });

  it('sends no chart rows for an observation that was deliberately not scored', async () => {
    const patient = await seedPatient(testApp.prisma);
    const admission = await seedAdmission(testApp.prisma, { mrn: patient.mrn });
    const observation = await seedObservation(testApp.prisma, {
      admissionId: admission.admissionId,
    });

    // A patient under 16 is not scored, and the non-score is recorded as such
    // rather than skipped (ADR 0005).
    await seedScore(testApp.prisma, {
      observationId: observation.observationId,
      status: 'not-eligible',
      notEligibleReason: 'under-16',
      aggregate: null,
      risk: null,
      partial: null,
      redScore: null,
      scaleUsed: null,
      scaleSource: null,
      respirationRateScore: null,
      oxygenSaturationScore: null,
      supplementalOxygenScore: null,
      systolicBPScore: null,
      pulseScore: null,
      consciousnessScore: null,
      temperatureScore: null,
    });

    const { body } = await request(testApp.server)
      .get(`/admissions/${admission.admissionId}/observations`)
      .expect(200);

    expect(body.data[0].score).toMatchObject({
      status: 'not-eligible',
      notEligibleReason: 'under-16',
      aggregate: null,
      // An object of seven nulls would read as "measured, and scored zero".
      parameters: null,
    });
  });

  it('marks a score as partial when a measurement was missing', async () => {
    const patient = await seedPatient(testApp.prisma);
    const admission = await seedAdmission(testApp.prisma, { mrn: patient.mrn });
    const observation = await seedObservation(testApp.prisma, {
      admissionId: admission.admissionId,
      systolicBP: null,
    });
    await seedScore(testApp.prisma, {
      observationId: observation.observationId,
      partial: true,
      systolicBPScore: null,
      missing: ['systolicBP'],
    });

    const { body } = await request(testApp.server)
      .get(`/admissions/${admission.admissionId}/observations`)
      .expect(200);

    expect(body.data[0].systolicBP).toBeNull();
    expect(body.data[0].score.partial).toBe(true);
    expect(body.data[0].score.missing).toEqual(['systolicBP']);
    expect(body.data[0].score.parameters.systolicBP).toBeNull();
  });
});

/**
 * The three states of an admission over HTTP. See ADR 0009.
 */
describe('GET /admissions, critical care', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  beforeEach(async () => {
    await testApp.reset();
  });

  afterAll(async () => {
    await testApp.close();
  });

  async function admissionOf(overrides: Record<string, unknown>): Promise<Record<string, unknown>> {
    const patient = await seedPatient(testApp.prisma);
    await seedAdmission(testApp.prisma, { mrn: patient.mrn, ...overrides });

    const { body } = await request(testApp.server).get('/admissions').expect(200);
    return body.data[0];
  }

  it('says nothing about critical care for an ordinary admission', async () => {
    const admission = await admissionOf({});

    expect(admission).toMatchObject({
      active: true,
      awaitingCriticalCare: false,
      criticalCareRequest: null,
      dischargeDestination: null,
    });
  });

  it('marks a patient waiting for a bed, and keeps them active', async () => {
    const admission = await admissionOf({
      transferUnit: 'intensive-care',
      transferRequestedAt: new Date('2026-09-22T11:20:00.000Z'),
      dischargedAt: null,
    });

    // Waiting is not leaving. This admission is still open.
    expect(admission).toMatchObject({
      active: true,
      awaitingCriticalCare: true,
      dischargeDestination: null,
      criticalCareRequest: {
        unit: 'intensive-care',
        requestedAt: '2026-09-22T11:20:00.000Z',
      },
    });
  });

  it('keeps the request after the patient has been transferred', async () => {
    const admission = await admissionOf({
      ward: 'cardiology',
      transferUnit: 'coronary-care',
      transferRequestedAt: new Date('2026-09-22T11:20:00.000Z'),
      dischargedAt: new Date('2026-09-22T19:00:00.000Z'),
      dischargeDestination: 'coronary-care',
    });

    expect(admission).toMatchObject({
      active: false,
      // The bed arrived: nobody is waiting any more.
      awaitingCriticalCare: false,
      dischargeDestination: 'coronary-care',
      criticalCareRequest: { unit: 'coronary-care' },
    });
  });

  it('says that a patient who went home went home', async () => {
    const admission = await admissionOf({
      dischargedAt: new Date('2026-09-22T13:00:00.000Z'),
    });

    expect(admission).toMatchObject({
      active: false,
      awaitingCriticalCare: false,
      criticalCareRequest: null,
      dischargeDestination: 'home',
    });
  });

  it('still counts a patient waiting for a bed as active in the filter', async () => {
    const patient = await seedPatient(testApp.prisma);
    await seedAdmission(testApp.prisma, {
      mrn: patient.mrn,
      transferUnit: 'intensive-care',
      transferRequestedAt: new Date('2026-09-22T11:20:00.000Z'),
    });

    const { body } = await request(testApp.server).get('/admissions?active=true').expect(200);

    expect(body.total).toBe(1);
  });
});
