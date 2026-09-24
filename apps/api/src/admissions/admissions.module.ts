import { Module } from '@nestjs/common';

import { AdmissionsController } from './admissions.controller.js';
import { AdmissionsService } from './admissions.service.js';

/** Read-only. Admissions and observations are written by the sync. */
@Module({
  controllers: [AdmissionsController],
  providers: [AdmissionsService],
})
export class AdmissionsModule {}
