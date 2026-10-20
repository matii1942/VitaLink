/**
 * GET /patients/search, driven over HTTP against the real database.
 *
 * The search exists to answer "where is this person", which the ward board
 * cannot: a board knows one ward, and only the patients currently in a bed.
 * These tests are mostly about the two things that make it useful — finding a
 * name somebody typed badly, and saying where the match is.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { createTestApp, type TestApp } from './helpers/app.js';
import { seedAdmission, seedObservation, seedPatient, seedScore } from './helpers/seed.js';

describe('GET /patients/search', () => {
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

  /** A patient in a bed, with a scored round, in one line. */
  async function admit(
    overrides: { familyName?: string; givenName?: string; ward?: string; risk?: string; aggregate?: number } = {},
  ) {
    const patient = await seedPatient(testApp.prisma, {
      familyName: overrides.familyName ?? 'VÁZQUEZ',
      givenName: overrides.givenName ?? 'Verónica',
    });

    const admission = await seedAdmission(testApp.prisma, {
      mrn: patient.mrn,
      ward: overrides.ward ?? 'internal-medicine',
      dischargedAt: null,
    });

    const observation = await seedObservation(testApp.prisma, {
      admissionId: admission.admissionId,
    });

    await seedScore(testApp.prisma, {
      observationId: observation.observationId,
      risk: overrides.risk ?? 'high',
      aggregate: overrides.aggregate ?? 8,
    });

    return { patient, admission };
  }

  it('finds a name typed without its accents', async () => {
    // The reason this endpoint is a hand-written query. A nurse on a phone
    // call types "vazquez"; the hospital stored "VÁZQUEZ".
    await admit({ familyName: 'VÁZQUEZ' });

    const { body } = await request(testApp.server).get('/patients/search?q=vazquez').expect(200);

    expect(body.total).toBe(1);
    expect(body.data[0].familyName).toBe('VÁZQUEZ');
  });

  it('finds a name typed with accents it does not have', async () => {
    // And the other direction, which is the one people forget to handle.
    await admit({ familyName: 'VAZQUEZ' });

    const { body } = await request(testApp.server).get('/patients/search?q=V%C3%81ZQUEZ').expect(200);

    expect(body.total).toBe(1);
  });

  it('matches on the medical record number', async () => {
    const { patient } = await admit();

    const { body } = await request(testApp.server)
      .get(`/patients/search?q=${patient.mrn}`)
      .expect(200);

    expect(body.data).toHaveLength(1);
    expect(body.data[0].mrn).toBe(patient.mrn);
  });

  it('matches on the given name as well as the family name', async () => {
    await admit({ familyName: 'SANTIAGO', givenName: 'Berta' });

    const { body } = await request(testApp.server).get('/patients/search?q=berta').expect(200);

    expect(body.total).toBe(1);
  });

  it('says where a match is, and how they are scoring', async () => {
    const { admission } = await admit({ ward: 'surgery', risk: 'high', aggregate: 8 });

    const { body } = await request(testApp.server).get('/patients/search?q=vazquez').expect(200);

    expect(body.data[0].current).toMatchObject({
      admissionId: admission.admissionId,
      ward: 'surgery',
      awaitingCriticalCare: false,
      risk: 'high',
      aggregate: 8,
    });
  });

  it('returns a discharged patient with nowhere to be', async () => {
    // Not an omission: "they went home" is the answer to where they are, and
    // a search that hid them would leave the caller thinking the record does
    // not exist.
    const patient = await seedPatient(testApp.prisma, { familyName: 'PEREA' });
    await seedAdmission(testApp.prisma, {
      mrn: patient.mrn,
      dischargedAt: new Date('2026-09-01T10:00:00.000Z'),
    });

    const { body } = await request(testApp.server).get('/patients/search?q=perea').expect(200);

    expect(body.total).toBe(1);
    expect(body.data[0].current).toBeNull();
    expect(body.data[0].openAdmissions).toBe(0);
  });

  it('reports a patient nobody has measured as having no score', async () => {
    const patient = await seedPatient(testApp.prisma, { familyName: 'NUEVO' });
    await seedAdmission(testApp.prisma, { mrn: patient.mrn, dischargedAt: null });

    const { body } = await request(testApp.server).get('/patients/search?q=nuevo').expect(200);

    expect(body.data[0].current).toMatchObject({ risk: null, aggregate: null });
  });

  it('flags a patient waiting for a critical care bed', async () => {
    const patient = await seedPatient(testApp.prisma, { familyName: 'OCASIO' });
    await seedAdmission(testApp.prisma, {
      mrn: patient.mrn,
      dischargedAt: null,
      transferUnit: 'intensive-care',
      transferRequestedAt: new Date('2026-09-26T10:00:00.000Z'),
    });

    const { body } = await request(testApp.server).get('/patients/search?q=ocasio').expect(200);

    expect(body.data[0].current.awaitingCriticalCare).toBe(true);
  });

  it('answers an empty search with every patient, paginated', async () => {
    await admit({ familyName: 'ALFA' });
    await admit({ familyName: 'BETA' });
    await admit({ familyName: 'GAMA' });

    const { body } = await request(testApp.server).get('/patients/search?pageSize=2').expect(200);

    expect(body).toMatchObject({ total: 3, totalPages: 2, pageSize: 2 });
    expect(body.data).toHaveLength(2);
  });

  it('orders by name, so a page boundary does not move somebody', async () => {
    await admit({ familyName: 'GAMA' });
    await admit({ familyName: 'ALFA' });
    await admit({ familyName: 'BETA' });

    const { body } = await request(testApp.server).get('/patients/search').expect(200);

    expect(body.data.map((p: { familyName: string }) => p.familyName)).toEqual([
      'ALFA',
      'BETA',
      'GAMA',
    ]);
  });

  it('answers a search that matches nobody with an empty page, not a 404', async () => {
    await admit();

    const { body } = await request(testApp.server)
      .get('/patients/search?q=nobodyhasthisname')
      .expect(200);

    expect(body).toMatchObject({ total: 0, data: [] });
  });

  it('is not read as a medical record number', async () => {
    // `search` sits before `:mrn` in the controller. If somebody moves it,
    // this request becomes a lookup for a patient called "search" and
    // answers 404. That break is silent in every other test.
    await request(testApp.server).get('/patients/search').expect(200);
  });

  it('refuses a page size that would read the whole table', async () => {
    await request(testApp.server).get('/patients/search?pageSize=1000000').expect(400);
  });
});
