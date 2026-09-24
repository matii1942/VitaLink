/**
 * Database helpers for the tests that use a real PostgreSQL.
 *
 * Every one of them goes through assertTestDatabase first. A test suite that
 * truncates tables is one configuration mistake away from emptying the
 * database somebody was working in, so the name of the database is treated as
 * a safety interlock: it has to end in _test, or nothing runs.
 */
import type { PrismaClient } from '../../src/generated/prisma/client.js';

/** The database name out of a PostgreSQL connection string. */
export function databaseNameOf(connectionString: string): string {
  return new URL(connectionString).pathname.replace(/^\//, '');
}

/**
 * Throws unless the connection string points at a test database.
 *
 * The name must end in _test and contain nothing but letters, digits and
 * underscores — the second half of that rule is because the name is
 * interpolated into a CREATE DATABASE statement, which cannot take a
 * parameter.
 */
export function assertTestDatabase(connectionString: string): void {
  const name = databaseNameOf(connectionString);

  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error(
      `Refusing to run tests against the database "${name}": the name must contain only letters, digits and underscores.`,
    );
  }

  if (!name.endsWith('_test')) {
    throw new Error(
      [
        `Refusing to run tests against the database "${name}".`,
        'The test suite empties every table, so it only runs against a database whose name ends in _test.',
        'Copy .env.test.example to .env.test at the repository root and point DATABASE_URL at vitalink_test.',
      ].join('\n'),
    );
  }
}

/** The test DATABASE_URL, checked. Throws if it is missing or not a test database. */
export function testDatabaseUrl(): string {
  const url = process.env['DATABASE_URL'];

  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.test.example to .env.test at the repository root.',
    );
  }

  assertTestDatabase(url);
  return url;
}

/**
 * Empties every table, leaving the schema alone.
 *
 * The table list comes from the database itself rather than from a hard-coded
 * array, so a model added to schema.prisma is emptied too without anybody
 * having to remember this file. _prisma_migrations is left alone: it is the
 * record of which migrations ran, not application data.
 *
 * One TRUNCATE for all tables, with CASCADE, so foreign keys do not dictate an
 * order. It is also far faster than deleting row by row.
 */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  testDatabaseUrl();

  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name <> '_prisma_migrations'
  `;

  if (tables.length === 0) {
    throw new Error(
      'The test database has no tables. The migrations did not run — check the output of globalSetup.',
    );
  }

  const list = tables.map((table) => `"public"."${table.table_name}"`).join(', ');

  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
