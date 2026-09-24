import { Module } from '@nestjs/common';

import { PatientsController } from './patients.controller.js';
import { PatientsService } from './patients.service.js';

/** Read-only. Patients are written by the sync, never by the API. */
@Module({
  controllers: [PatientsController],
  providers: [PatientsService],
})
export class PatientsModule {}
