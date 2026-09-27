/**
 * Boots the real application for a test.
 *
 * The same AppModule the server runs, wired to the real database — not a mock
 * and not an in-memory substitute. An integration test that talks to a fake
 * database proves that the fake works.
 *
 * The Prisma client handed back is the application's own instance, so a test
 * that writes rows and a request that reads them use one connection pool.
 */
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { Server } from 'node:http';

import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { truncateAll } from './database.js';
import { resetSequence } from './seed.js';

export interface TestApp {
  app: INestApplication;
  /** The application's Prisma client — for seeding and for assertions. */
  prisma: PrismaService;
  /** What supertest drives: `request(testApp.server).get('/health')`. */
  server: Server;
  /**
   * Empties every table and restarts the seed counter. Call it in beforeEach:
   * it is the one line that makes each test independent of the others.
   */
  reset(): Promise<void>;
  close(): Promise<void>;
}

/**
 * A provider to swap out before the application is built.
 *
 * There is exactly one thing in VitaLink that cannot be exercised for real in
 * a test: the language model, which costs money and answers differently every
 * time. Everything else — the database, the scorer, the SOAP client against
 * its simulator — runs as it runs in production, because a test against a
 * substitute proves that the substitute works.
 */
export interface ProviderOverride {
  /** Exactly what Nest accepts as an injection token, and nothing else. */
  token: Parameters<TestingModuleBuilder['overrideProvider']>[0];
  useValue: unknown;
}

export async function createTestApp(overrides: ProviderOverride[] = []): Promise<TestApp> {
  let builder = Test.createTestingModule({ imports: [AppModule] });

  for (const override of overrides) {
    builder = builder.overrideProvider(override.token).useValue(override.useValue);
  }

  const moduleFixture = await builder.compile();

  const app = moduleFixture.createNestApplication();
  await app.init();

  const prisma = app.get(PrismaService);

  return {
    app,
    prisma,
    server: app.getHttpServer() as Server,
    reset: async () => {
      await truncateAll(prisma);
      resetSequence();
    },
    close: () => app.close(),
  };
}
