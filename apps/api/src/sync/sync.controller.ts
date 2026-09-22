import { Controller, Get, HttpCode, Post } from '@nestjs/common';

import { SyncService } from './sync.service.js';

/**
 * Triggers a sync by hand. In Sprint 4 an hourly scheduled job takes over,
 * and this endpoint stays for running one on demand.
 */
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post()
  @HttpCode(200)
  run() {
    return this.sync.run();
  }

  @Get('runs')
  runs() {
    return this.sync.recentRuns();
  }
}
