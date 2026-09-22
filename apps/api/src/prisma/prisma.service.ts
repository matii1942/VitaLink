import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client.js';

/**
 * The database client, as a NestJS provider.
 *
 * Prisma 7 talks to PostgreSQL through an explicit driver adapter. Nothing
 * connects when the application starts: the connection pool opens on the
 * first query. That keeps tests that never touch the database — the health
 * check, for one — from needing a database to exist.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
