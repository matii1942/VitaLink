import { Module } from '@nestjs/common';

import { LegacyModule } from '../legacy/legacy.module.js';
import { SyncController } from './sync.controller.js';
import { SyncService } from './sync.service.js';

@Module({
  imports: [LegacyModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
