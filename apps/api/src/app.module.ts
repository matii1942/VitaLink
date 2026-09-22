// Must come first: loads the repository-root .env before any module reads it.
import './config/env.js';

import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SyncModule } from './sync/sync.module.js';

@Module({
  imports: [PrismaModule, HealthModule, SyncModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
