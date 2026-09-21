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
 */
import path from 'node:path';
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

config({ path: path.resolve(process.cwd(), '../../.env') });

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
