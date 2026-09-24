import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseBoolPipe,
  ParseEnumPipe,
  ParseIntPipe,
  Query,
} from '@nestjs/common';

import { DEFAULT_PAGE_SIZE, pagination, type Page } from '../http/pagination.js';
import { optionalText, SortOrder } from '../http/query.js';
import { AdmissionsService } from './admissions.service.js';
import type { AdmissionWithPatient, ObservationView } from './admissions.dto.js';

@Controller('admissions')
export class AdmissionsController {
  constructor(private readonly admissions: AdmissionsService) {}

  /**
   * GET /admissions?ward=internal-medicine&active=true&page=1&pageSize=25
   *
   * `active` goes through ParseBoolPipe with `optional`, so "true" and "false"
   * become booleans, an absent parameter stays undefined — meaning both — and
   * `?active=maybe` is a 400 rather than a silent guess.
   */
  @Get()
  list(
    @Query('ward') ward: string | undefined,
    @Query('active', new ParseBoolPipe({ optional: true })) active: boolean | undefined,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(DEFAULT_PAGE_SIZE), ParseIntPipe) pageSize: number,
  ): Promise<Page<AdmissionWithPatient>> {
    return this.admissions.list(
      { ward: optionalText(ward), active },
      pagination(page, pageSize),
    );
  }

  /** GET /admissions/:admissionId/observations?order=asc — 404 for an unknown admission. */
  @Get(':admissionId/observations')
  observations(
    @Param('admissionId') admissionId: string,
    @Query('order', new DefaultValuePipe(SortOrder.desc), new ParseEnumPipe(SortOrder))
    order: SortOrder,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(DEFAULT_PAGE_SIZE), ParseIntPipe) pageSize: number,
  ): Promise<Page<ObservationView>> {
    return this.admissions.observations(admissionId, order, pagination(page, pageSize));
  }
}
