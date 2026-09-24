/**
 * GET /wards and GET /wards/:ward/board.
 *
 * The board is the one endpoint written as hand-made SQL, so these tests carry
 * more weight than the others: there is no generated query builder underneath
 * to have got the joins right.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { createTestApp, type TestApp } from './helpers/app.js';
import { seedAdmission, seedObservation, seedPatient, seedScore } from './helpers/seed.js';

describe('GET /wards', () => {
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

  it('lists nothing when no admission has ever been recorded', async () => {
    const { body } = await request(testApp.server).get('/wards').expect(200);

    expect(body).toEqual([]);
  });

  it('counts open and total admissions per ward, in name order', async () => {
    const patient = await seedPatient(testApp.prisma);

    await seedAdmission(testApp.prisma, { mrn: patient.mrn, ward: 'surgery', dischargedAt: null });
    await seedAdmission(testApp.prisma, {
      mrn: patient.mrn,
      ward: 'surgery',
      dischargedAt: new Date('2026-09-01T10:00:00.000Z'),
    });
    await seedAdmission(testApp.prisma, {
      mrn: patient.mrn,
      ward: 'cardiology',
      dischargedAt: null,
    });

    const { body } = await request(testApp.server).get('/wards').expect(200);

    expect(body).toEqual([
      { ward: 'cardiology', openAdmissions: 1, totalAdmissions: 1 },
      { ward: 'surgery', openAdmissions: 1, totalAdmissions: 2 },
    ]);
  });

  it('counts as numbers, not as strings', async () => {
    // PostgreSQL counts in bigint, which arrives as a BigInt that JSON cannot
    // serialise. The query casts to int; this is the test that notices if it
    // stops doing so.
    const patient = await seedPatient(testApp.prisma);
    await seedAdmission(testApp.prisma, { mrn: patient.mrn, ward: 'surgery' });

    const { body } = await request(testApp.server).get('/wards').expect(200);

    expect(typeof body[0].openAdmissions).toBe('number');
    expect(typeof body[0].totalAdmissions).toBe('number');
  });
});

describe('GET /wards/:ward/board', () => {
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

  /**
   * One patient in one bed, with as many rounds of vital signs as given. Each
   * round is `{ recordedAt, aggregate, risk }`; an empty list means nobody has
   * recorded anything yet.
   */
  async function admit(options: {
    ward?: string;
    familyName?: string;
    birthDate?: Date;
    dischargedAt?: Date | null;
    transfer?: { unit: string; requestedAt: Date };
    rounds?: Array<{
      recordedAt: Date;
      aggregate: number | null;
      risk: string | null;
      status?: string;
    }>;
  }): Promise<string> {
    const patient = await seedPatient(testApp.prisma, {
      ...(options.familyName === undefined ? {} : { familyName: options.familyName }),
      ...(options.birthDate === undefined ? {} : { birthDate: options.birthDate }),
    });

    const admission = await seedAdmission(testApp.prisma, {
      mrn: patient.mrn,
      ward: options.ward ?? 'surgery',
      dischargedAt: options.dischargedAt ?? null,
      ...(options.transfer === undefined
        ? {}
        : {
            transferUnit: options.transfer.unit,
            transferRequestedAt: options.transfer.requestedAt,
          }),
    });

    for (const round of options.rounds ?? []) {
      const observation = await seedObservation(testApp.prisma, {
        admissionId: admission.admissionId,
        recordedAt: round.recordedAt,
      });

      await seedScore(testApp.prisma, {
        observationId: observation.observationId,
        status: round.status ?? 'scored',
        aggregate: round.aggregate,
        risk: round.risk,
      });
    }

    return admission.admissionId;
  }

  it('answers 404 for a ward no admission has ever been recorded in', async () => {
    const { body } = await request(testApp.server).get('/wards/oncology/board').expect(404);

    expect(body.message).toContain('oncology');
  });

  it('answers with an empty board for a ward whose patients have all gone home', async () => {
    await admit({ ward: 'surgery', dischargedAt: new Date('2026-09-02T12:00:00.000Z') });

    const { body } = await request(testApp.server).get('/wards/surgery/board').expect(200);

    expect(body).toMatchObject({ ward: 'surgery', openAdmissions: 0, rows: [] });
    expect(new Date(body.generatedAt).getTime()).not.toBeNaN();
    expect(typeof body.orderedBy).toBe('string');
  });

  it('shows only the patients still in that ward', async () => {
    const here = await admit({ ward: 'surgery' });
    await admit({ ward: 'cardiology' });
    await admit({ ward: 'surgery', dischargedAt: new Date('2026-09-03T09:00:00.000Z') });

    const { body } = await request(testApp.server).get('/wards/surgery/board').expect(200);

    expect(body.openAdmissions).toBe(1);
    expect(body.rows.map((r: { admissionId: string }) => r.admissionId)).toEqual([here]);
  });

  it('shows the most recent round of vital signs, not the first', async () => {
    await admit({
      ward: 'surgery',
      rounds: [
        { recordedAt: new Date('2026-09-16T08:00:00.000Z'), aggregate: 1, risk: 'low' },
        { recordedAt: new Date('2026-09-16T16:00:00.000Z'), aggregate: 7, risk: 'high' },
        { recordedAt: new Date('2026-09-16T12:00:00.000Z'), aggregate: 4, risk: 'low' },
      ],
    });

    const { body } = await request(testApp.server).get('/wards/surgery/board').expect(200);

    expect(body.rows[0].latestObservation.recordedAt).toBe('2026-09-16T16:00:00.000Z');
    expect(body.rows[0].latestObservation.score.aggregate).toBe(7);
    // The count is of every round, not of the one that is shown.
    expect(body.rows[0].observationCount).toBe(3);
  });

  it('keeps a patient whose vital signs have not been taken yet', async () => {
    const waiting = await admit({ ward: 'surgery', familyName: 'Sosa', rounds: [] });

    const { body } = await request(testApp.server).get('/wards/surgery/board').expect(200);

    const row = body.rows.find((r: { admissionId: string }) => r.admissionId === waiting);
    expect(row).toBeDefined();
    expect(row.latestObservation).toBeNull();
    expect(row.observationCount).toBe(0);
    expect(row.patient.familyName).toBe('Sosa');
  });

  it('puts the most concerning patient first', async () => {
    const at = (hour: string) => new Date(`2026-09-16T${hour}:00:00.000Z`);

    const high = await admit({
      ward: 'surgery',
      rounds: [{ recordedAt: at('10'), aggregate: 8, risk: 'high' }],
    });
    const mediumHigher = await admit({
      ward: 'surgery',
      rounds: [{ recordedAt: at('10'), aggregate: 6, risk: 'medium' }],
    });
    const mediumLower = await admit({
      ward: 'surgery',
      rounds: [{ recordedAt: at('10'), aggregate: 5, risk: 'medium' }],
    });
    const lowMedium = await admit({
      ward: 'surgery',
      rounds: [{ recordedAt: at('10'), aggregate: 3, risk: 'low-medium' }],
    });
    const notMeasured = await admit({ ward: 'surgery', rounds: [] });
    const notScored = await admit({
      ward: 'surgery',
      rounds: [{ recordedAt: at('10'), aggregate: null, risk: null, status: 'not-eligible' }],
    });
    const low = await admit({
      ward: 'surgery',
      rounds: [{ recordedAt: at('10'), aggregate: 1, risk: 'low' }],
    });

    const { body } = await request(testApp.server).get('/wards/surgery/board').expect(200);

    expect(body.rows.map((r: { admissionId: string }) => r.admissionId)).toEqual([
      high,
      mediumHigher,
      mediumLower,
      lowMedium,
      // Nobody has measured this patient: that is something to do, so it ranks
      // above the patients who are known to be fine.
      notMeasured,
      notScored,
      low,
    ]);
  });

  it('breaks a tie with the oldest reading first', async () => {
    const stale = await admit({
      ward: 'surgery',
      rounds: [{ recordedAt: new Date('2026-09-16T04:00:00.000Z'), aggregate: 6, risk: 'medium' }],
    });
    const fresh = await admit({
      ward: 'surgery',
      rounds: [{ recordedAt: new Date('2026-09-16T15:00:00.000Z'), aggregate: 6, risk: 'medium' }],
    });

    const { body } = await request(testApp.server).get('/wards/surgery/board').expect(200);

    expect(body.rows.map((r: { admissionId: string }) => r.admissionId)).toEqual([stale, fresh]);
  });

  it('carries the patient, with a birth date that survived the round trip', async () => {
    await admit({
      ward: 'surgery',
      familyName: 'Barrios',
      birthDate: new Date('1948-11-30T00:00:00.000Z'),
      rounds: [{ recordedAt: new Date('2026-09-16T10:00:00.000Z'), aggregate: 2, risk: 'low' }],
    });

    const { body } = await request(testApp.server).get('/wards/surgery/board').expect(200);

    const { patient } = body.rows[0];

    // The board selects the birth date as text precisely so that this does not
    // shift by a day depending on where the server is running.
    expect(patient.birthDate).toBe('1948-11-30');
    expect(patient.familyName).toBe('Barrios');
    expect(patient).not.toHaveProperty('nationalId');
  });

  it('sends the same observation shape as the observations endpoint', async () => {
    const admissionId = await admit({
      ward: 'surgery',
      rounds: [{ recordedAt: new Date('2026-09-16T10:00:00.000Z'), aggregate: 2, risk: 'low' }],
    });

    const board = await request(testApp.server).get('/wards/surgery/board').expect(200);
    const list = await request(testApp.server)
      .get(`/admissions/${admissionId}/observations`)
      .expect(200);

    // Two very different queries, one shape. If they ever diverge, a consumer
    // that reads both has to special-case one of them.
    expect(board.body.rows[0].latestObservation).toEqual(list.body.data[0]);
  });

  it('puts a patient waiting for a critical care bed above every score', async () => {
    const at = (hour: string) => new Date(`2026-09-16T${hour}:00:00.000Z`);

    const high = await admit({
      ward: 'surgery',
      rounds: [{ recordedAt: at('10'), aggregate: 9, risk: 'high' }],
    });

    // Lower score, higher position: a bed has been asked for and has not
    // appeared, so this is the patient somebody is already on the phone about.
    const waitingForBed = await admit({
      ward: 'surgery',
      transfer: { unit: 'intensive-care', requestedAt: at('08') },
      rounds: [{ recordedAt: at('10'), aggregate: 7, risk: 'high' }],
    });

    const { body } = await request(testApp.server).get('/wards/surgery/board').expect(200);

    expect(body.rows.map((r: { admissionId: string }) => r.admissionId)).toEqual([
      waitingForBed,
      high,
    ]);
    expect(body.rows[0].awaitingCriticalCare).toBe(true);
    expect(body.rows[1].awaitingCriticalCare).toBe(false);
    expect(body.orderedBy).toContain('critical care');
  });

  it('shows when the bed was asked for', async () => {
    await admit({
      ward: 'cardiology',
      transfer: { unit: 'coronary-care', requestedAt: new Date('2026-09-16T08:20:00.000Z') },
      rounds: [{ recordedAt: new Date('2026-09-16T10:00:00.000Z'), aggregate: 8, risk: 'high' }],
    });

    const { body } = await request(testApp.server).get('/wards/cardiology/board').expect(200);

    expect(body.rows[0].criticalCareRequest).toEqual({
      unit: 'coronary-care',
      requestedAt: '2026-09-16T08:20:00.000Z',
    });
  });

  it('drops a patient from the board once the bed appears', async () => {
    await admit({
      ward: 'surgery',
      transfer: { unit: 'intensive-care', requestedAt: new Date('2026-09-16T08:00:00.000Z') },
      dischargedAt: new Date('2026-09-16T14:00:00.000Z'),
      rounds: [{ recordedAt: new Date('2026-09-16T10:00:00.000Z'), aggregate: 9, risk: 'high' }],
    });

    const { body } = await request(testApp.server).get('/wards/surgery/board').expect(200);

    // They left. The admission is history, and history is not a board.
    expect(body.rows).toEqual([]);
    expect(body.openAdmissions).toBe(0);
  });
});
