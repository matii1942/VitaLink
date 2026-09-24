/**
 * GET /patients and GET /patients/:mrn, driven over HTTP against the real
 * database.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { createTestApp, type TestApp } from './helpers/app.js';
import { seedAdmission, seedObservation, seedPatient } from './helpers/seed.js';

/** A birthDate that makes the patient exactly this old today, in any year. */
function bornYearsAgo(years: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate()));
}

describe('GET /patients', () => {
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

  it('answers with an empty page when there are no patients', async () => {
    const { body } = await request(testApp.server).get('/patients').expect(200);

    expect(body).toEqual({ data: [], page: 1, pageSize: 25, total: 0, totalPages: 0 });
  });

  it('sends exactly the fields the API promises, and no others', async () => {
    await seedPatient(testApp.prisma, { birthDate: bornYearsAgo(72) });

    const { body } = await request(testApp.server).get('/patients').expect(200);

    // Spelled out on purpose. A field added to the database should not appear
    // in the API by accident — least of all nationalId (ADR 0008) or the
    // createdAt/updatedAt columns the sync writes for itself.
    expect(Object.keys(body.data[0]).sort()).toEqual([
      'age',
      'birthDate',
      'familyName',
      'givenName',
      'mrn',
      'news2Scale',
      'openAdmissions',
      'sex',
    ]);
  });

  it('sends a birth date as a calendar date and the age in whole years', async () => {
    await seedPatient(testApp.prisma, { birthDate: new Date('1953-04-09T00:00:00.000Z') });

    const { body } = await request(testApp.server).get('/patients').expect(200);

    expect(body.data[0].birthDate).toBe('1953-04-09');
    expect(body.data[0].age).toBe(new Date().getUTCFullYear() - 1953 - agePendingBirthday());

    function agePendingBirthday(): number {
      const now = new Date();
      const before =
        now.getUTCMonth() < 3 || (now.getUTCMonth() === 3 && now.getUTCDate() < 9);
      return before ? 1 : 0;
    }
  });

  it('counts only the admissions that are still open', async () => {
    const patient = await seedPatient(testApp.prisma);
    await seedAdmission(testApp.prisma, {
      mrn: patient.mrn,
      dischargedAt: new Date('2026-09-05T09:00:00.000Z'),
    });
    await seedAdmission(testApp.prisma, { mrn: patient.mrn, dischargedAt: null });

    const { body } = await request(testApp.server).get('/patients').expect(200);

    expect(body.data[0].openAdmissions).toBe(1);
  });

  it('orders by family name, then given name', async () => {
    await seedPatient(testApp.prisma, { familyName: 'Zabala', givenName: 'Ana' });
    await seedPatient(testApp.prisma, { familyName: 'Acosta', givenName: 'Beatriz' });
    await seedPatient(testApp.prisma, { familyName: 'Acosta', givenName: 'Alberto' });

    const { body } = await request(testApp.server).get('/patients').expect(200);

    expect(body.data.map((p: { familyName: string; givenName: string }) => `${p.familyName}, ${p.givenName}`)).toEqual([
      'Acosta, Alberto',
      'Acosta, Beatriz',
      'Zabala, Ana',
    ]);
  });

  it('pages through the results', async () => {
    await seedPatient(testApp.prisma, { familyName: 'Uno' });
    await seedPatient(testApp.prisma, { familyName: 'Dos' });
    await seedPatient(testApp.prisma, { familyName: 'Tres' });

    const first = await request(testApp.server).get('/patients?page=1&pageSize=2').expect(200);
    expect(first.body).toMatchObject({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
    expect(first.body.data).toHaveLength(2);

    const second = await request(testApp.server).get('/patients?page=2&pageSize=2').expect(200);
    expect(second.body.data).toHaveLength(1);

    // Every patient appears once across the two pages, and none twice.
    const mrns = [...first.body.data, ...second.body.data].map((p: { mrn: string }) => p.mrn);
    expect(new Set(mrns).size).toBe(3);
  });

  it('returns an empty page, not an error, past the last page', async () => {
    await seedPatient(testApp.prisma);

    const { body } = await request(testApp.server).get('/patients?page=9').expect(200);

    expect(body).toMatchObject({ data: [], page: 9, total: 1, totalPages: 1 });
  });

  it('refuses a query it cannot honour', async () => {
    await request(testApp.server).get('/patients?page=abc').expect(400);
    await request(testApp.server).get('/patients?page=0').expect(400);
    await request(testApp.server).get('/patients?pageSize=0').expect(400);
    await request(testApp.server).get('/patients?pageSize=101').expect(400);
  });
});

describe('GET /patients/:mrn', () => {
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

  it('returns the patient with their admissions, most recent first', async () => {
    const patient = await seedPatient(testApp.prisma, { familyName: 'Ledesma' });

    const older = await seedAdmission(testApp.prisma, {
      mrn: patient.mrn,
      admittedAt: new Date('2026-03-01T08:00:00.000Z'),
      dischargedAt: new Date('2026-03-09T11:30:00.000Z'),
      ward: 'surgery',
    });
    const current = await seedAdmission(testApp.prisma, {
      mrn: patient.mrn,
      admittedAt: new Date('2026-09-14T22:15:00.000Z'),
      dischargedAt: null,
    });

    await seedObservation(testApp.prisma, { admissionId: current.admissionId });
    await seedObservation(testApp.prisma, { admissionId: current.admissionId });

    const { body } = await request(testApp.server).get(`/patients/${patient.mrn}`).expect(200);

    expect(body.familyName).toBe('Ledesma');
    expect(body).not.toHaveProperty('nationalId');
    expect(body.admissions.map((a: { admissionId: string }) => a.admissionId)).toEqual([
      current.admissionId,
      older.admissionId,
    ]);

    expect(body.admissions[0]).toMatchObject({
      active: true,
      dischargedAt: null,
      admittedAt: '2026-09-14T22:15:00.000Z',
      ward: 'internal-medicine',
      observationCount: 2,
    });

    expect(body.admissions[1]).toMatchObject({
      active: false,
      dischargedAt: '2026-03-09T11:30:00.000Z',
      ward: 'surgery',
      observationCount: 0,
    });
  });

  it('answers 404 for an MRN that does not exist', async () => {
    const { body } = await request(testApp.server).get('/patients/MRN-nope').expect(404);

    expect(body.message).toContain('MRN-nope');
  });
});
