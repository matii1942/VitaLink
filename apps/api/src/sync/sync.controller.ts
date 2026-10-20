import { Controller, Get, HttpCode, Post } from '@nestjs/common';

import { toSyncRunView, type SyncRunView } from './sync.dto.js';
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

  /**
   * GET /sync/runs — the most recent runs, newest first.
   *
   * Mapped through a view rather than answered with the database row. The
   * `errors` column is a `Json`, which means "whatever was written into it",
   * and the boundary is where that gets checked (see sync.dto.ts).
   */
  @Get('runs')
  async runs(): Promise<SyncRunView[]> {
    const records = await this.sync.recentRuns();
    return records.map(toSyncRunView);
  }
}
