/**
 * Loads the repository-root .env files into process.env.
 *
 * Imported for its side effect at the top of AppModule, so it runs for every
 * way the application starts: `npm run start:dev`, and the tests, which build
 * AppModule directly and never go through main.ts.
 *
 * Two files are read, in this order:
 *
 *   .env.test   only when NODE_ENV is "test" — Vitest sets it automatically
 *   .env        always
 *
 * dotenv never overwrites a variable that is already set, so the first file to
 * define one wins. That gives .env.test priority over .env while tests run,
 * and gives the real environment priority over both files: in CI there is no
 * .env at all and the workflow supplies the variables itself.
 *
 * This ordering is what keeps the test suite away from the development
 * database. The tests truncate every table between cases; they must point at
 * vitalink_test, and they do because .env.test says so. The harness checks the
 * name as well, in test/helpers/database.ts — one mechanism to get it right,
 * one to catch it when it is wrong anyway.
 *
 * prisma.config.ts repeats this logic, because Prisma loads that file with its
 * own loader and cannot import from src/. Change one, change the other.
 */
import path from 'node:path';
import { config } from 'dotenv';

const repositoryRoot = path.resolve(process.cwd(), '../..');

if (process.env['NODE_ENV'] === 'test') {
  config({ path: path.join(repositoryRoot, '.env.test'), quiet: true });
}

config({ path: path.join(repositoryRoot, '.env'), quiet: true });
