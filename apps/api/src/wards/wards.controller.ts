import { Controller, Get, Param } from '@nestjs/common';

import { WardsService } from './wards.service.js';
import type { WardBoard, WardSummary } from './wards.dto.js';

@Controller('wards')
export class WardsController {
  constructor(private readonly wards: WardsService) {}

  /** GET /wards — which wards exist, according to the data. */
  @Get()
  list(): Promise<WardSummary[]> {
    return this.wards.list();
  }

  /**
   * GET /wards/:ward/board
   *
   * Not paginated, deliberately. A board is one screen for one ward: a general
   * ward holds tens of patients, not thousands, and a nurse asking "who needs
   * attention" cannot be handed page 1 of 3. If a ward ever grows past what one
   * response should carry, that is a reason to talk about the ward, not to add
   * a page parameter.
   */
  @Get(':ward/board')
  board(@Param('ward') ward: string): Promise<WardBoard> {
    return this.wards.board(ward);
  }
}
