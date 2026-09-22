/**
 * Loads the repository-root .env into process.env.
 *
 * Imported for its side effect at the top of AppModule, so it runs for every
 * way the application starts: `npm run start:dev`, and the e2e tests, which
 * build AppModule directly and never go through main.ts.
 *
 * Variables already set in the environment win — in CI there is no .env file
 * and the workflow provides them instead.
 */
import path from 'node:path';
import { config } from 'dotenv';

config({ path: path.resolve(process.cwd(), '../../.env'), quiet: true });
