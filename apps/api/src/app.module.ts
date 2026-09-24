// Must come first: loads the repository-root .env before any module reads it.
import './config/env.js';

import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AdmissionsModule } from './admissions/admissions.module.js';
import { AppService } from './app.service.js';
import { HealthModule } from './health/health.module.js';
import { PatientsModule } from './patients/patients.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SyncModule } from './sync/sync.module.js';
import { WardsModule } from './wards/wards.module.js';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    PatientsModule,
    AdmissionsModule,
    WardsModule,
    SyncModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
