/**
 * Runs once, before the whole e2e suite (see vitest.config.e2e.ts).
 *
 * Makes the test database usable from nothing: creates it if it does not
 * exist, then applies the migrations. A fresh clone needs only the PostgreSQL
 * container running and a .env.test file; `npm run test:e2e` does the rest.
 *
 * The same code runs in CI, where the database already exists (the service
 * container creates it) and the migrations have already been applied by a
 * workflow step. Both operations are idempotent, so it simply finds nothing to
 * do.
 */
import { execFileSync } from 'node:child_process';
import { Client } from 'pg';

// Populates process.env from .env.test and .env before anything reads it.
import '../../src/config/env.js';
import { databaseNameOf, testDatabaseUrl } from './database.js';

/** PostgreSQL's error code for "that database does not exist". */
const INVALID_CATALOG_NAME = '3D000';

export default async function setup(): Promise<void> {
  const url = testDatabaseUrl();
  await ensureDatabaseExists(url);
  applyMigrations(url);
}

async function ensureDatabaseExists(url: string): Promise<void> {
  const probe = new Client({ connectionString: url });

  try {
    await probe.connect();
    await probe.end();
    return;
  } catch (error) {
    if ((error as { code?: string }).code !== INVALID_CATALOG_NAME) {
      throw error;
    }
  }

  // Connect to the server's default database to create ours. The name cannot
  // be a query parameter in CREATE DATABASE; assertTestDatabase, which
  // testDatabaseUrl already called, is what makes interpolating it safe.
  const name = databaseNameOf(url);
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';

  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();

  try {
    console.log(`Creating the test database "${name}".`);
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }
}

function applyMigrations(url: string): void {
  const onWindows = process.platform === 'win32';

  execFileSync(onWindows ? 'npx.cmd' : 'npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    // Windows refuses to run a .cmd file without a shell. No part of this
    // command line comes from outside the project.
    shell: onWindows,
    // DATABASE_URL is passed explicitly so that migrate deploy cannot resolve
    // a different database than the one the tests checked.
    env: { ...process.env, DATABASE_URL: url },
  });
}
