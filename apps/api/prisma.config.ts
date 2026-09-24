/**
 * Prisma configuration (Prisma ORM 7).
 *
 * Prisma 7 no longer loads .env by itself. This project keeps a single .env at
 * the repository root — the same one docker-compose reads — instead of one per
 * package, so it is loaded explicitly here.
 *
 * The path resolves from the working directory. Prisma commands run from
 * apps/api, either directly or through npm scripts, which npm always runs in
 * the package's own folder, so the root .env is two levels up.
 *
 * NODE_ENV=test makes .env.test win, exactly as it does for the application
 * (see src/config/env.ts, which explains the ordering). That is the escape
 * hatch for running a Prisma command against the test database by hand:
 *
 *   NODE_ENV=test npx prisma migrate deploy      # bash
 *   $env:NODE_ENV="test"; npx prisma migrate deploy   # PowerShell
 *
 * The test suite applies its own migrations, so this is rarely needed.
 */
import path from 'node:path';
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

const repositoryRoot = path.resolve(process.cwd(), '../..');

if (process.env['NODE_ENV'] === 'test') {
  config({ path: path.join(repositoryRoot, '.env.test') });
}

config({ path: path.join(repositoryRoot, '.env') });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // process.env rather than Prisma's env() helper: env() throws when the
    // variable is missing, and `prisma generate` in CI needs no database.
    url: process.env['DATABASE_URL'],
  },
});
