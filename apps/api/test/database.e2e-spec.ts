/**
 * The test harness testing itself.
 *
 * Nothing here is about a feature. It proves that the three things every
 * database-backed test from now on depends on actually hold: the migrations
 * reached this database and produced the columns the schema asked for, rows can
 * be written and read back unchanged, and the tables really are empty at the
 * start of each test.
 *
 * If one of the endpoint tests later fails, this file is what tells you whether
 * the endpoint is wrong or the harness is.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, type TestApp } from './helpers/app.js';
import { databaseNameOf, testDatabaseUrl } from './helpers/database.js';
import { seedAdmittedPatient } from './helpers/seed.js';

interface ColumnRow {
  table_name: string;
  column_name: string;
  data_type: string;
}

describe('the test database', () => {
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

  it('is a database named for testing, not the development one', () => {
    expect(databaseNameOf(testDatabaseUrl())).toMatch(/_test$/);
  });

  it('stores every instant with its time zone', async () => {
    // The whole point of this system is getting time zones right. A DateTime
    // column that Prisma created with its default type would hold a bare clock
    // reading, which is the ambiguity the integration exists to remove — so
    // this asserts it against the real database rather than trusting the
    // schema file to have been migrated.
    const columns = await testApp.prisma.$queryRaw<ColumnRow[]>`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name <> '_prisma_migrations'
        AND (data_type LIKE 'timestamp%' OR data_type = 'date')
    `;

    const zoneless = columns.filter((column) => column.data_type === 'timestamp without time zone');
    expect(zoneless).toEqual([]);

    // birthDate is the deliberate exception: a calendar date, not an instant.
    const dates = columns
      .filter((column) => column.data_type === 'date')
      .map((column) => `${column.table_name}.${column.column_name}`);
    expect(dates).toEqual(['Patient.birthDate']);

    // And the migrations really did run: the tables above are not an empty set.
    expect(columns.length).toBeGreaterThan(10);
  });

  it('reads back a written instant unchanged', async () => {
    const recordedAt = new Date('2026-07-15T03:30:00.000Z');
    const { observationId } = await seedAdmittedPatient(testApp.prisma, {
      observation: { recordedAt },
    });

    const stored = await testApp.prisma.observation.findUniqueOrThrow({
      where: { observationId },
    });

    expect(stored.recordedAt.toISOString()).toBe(recordedAt.toISOString());
  });

  it('seeds a complete patient chain', async () => {
    const { mrn, admissionId, observationId } = await seedAdmittedPatient(testApp.prisma);

    const patient = await testApp.prisma.patient.findUniqueOrThrow({
      where: { mrn },
      include: { admissions: { include: { observations: { include: { score: true } } } } },
    });

    expect(patient.admissions).toHaveLength(1);
    expect(patient.admissions[0]?.admissionId).toBe(admissionId);
    expect(patient.admissions[0]?.dischargedAt).toBeNull();
    expect(patient.admissions[0]?.observations[0]?.observationId).toBe(observationId);
    expect(patient.admissions[0]?.observations[0]?.score?.risk).toBe('low');
  });

  it('starts every test with empty tables', async () => {
    // This test only sees an empty database because the previous one's rows
    // were truncated. It asserts that, and then leaves rows behind on purpose:
    // whichever test runs next proves the same thing again.
    const counts = await countEverything();
    expect(counts).toEqual({ patients: 0, admissions: 0, observations: 0, scores: 0 });

    await seedAdmittedPatient(testApp.prisma);

    expect(await countEverything()).toEqual({
      patients: 1,
      admissions: 1,
      observations: 1,
      scores: 1,
    });
  });

  async function countEverything(): Promise<Record<string, number>> {
    const [patients, admissions, observations, scores] = await Promise.all([
      testApp.prisma.patient.count(),
      testApp.prisma.admission.count(),
      testApp.prisma.observation.count(),
      testApp.prisma.score.count(),
    ]);

    return { patients, admissions, observations, scores };
  }
});
