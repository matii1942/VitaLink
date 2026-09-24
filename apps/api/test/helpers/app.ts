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
import { Test } from '@nestjs/testing';
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

export async function createTestApp(): Promise<TestApp> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

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
