import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Query } from '@nestjs/common';

import { DEFAULT_PAGE_SIZE, pagination, type Page } from '../http/pagination.js';
import { PatientsService } from './patients.service.js';
import type { PatientDetail, PatientSearchResult, PatientSummary } from './patients.dto.js';

@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  /**
   * GET /patients?page=1&pageSize=25
   *
   * The pipes run before the handler: DefaultValuePipe fills in the parameter
   * when it is absent, ParseIntPipe turns "2" into 2 and answers 400 for
   * anything that is not a number. The handler therefore never sees a string.
   */
  @Get()
  list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(DEFAULT_PAGE_SIZE), ParseIntPipe) pageSize: number,
  ): Promise<Page<PatientSummary>> {
    return this.patients.list(pagination(page, pageSize));
  }

  /**
   * GET /patients/search?q=vazquez — patients by name or MRN, wherever they are.
   *
   * Declared before `:mrn` on purpose. Nest matches routes in the order they
   * are written, and `search` would otherwise be read as a medical record
   * number and answered with a 404. Moving this method below the next one is
   * a silent break, which is why it is written down here rather than left for
   * somebody to rediscover.
   */
  @Get('search')
  search(
    @Query('q', new DefaultValuePipe('')) q: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(DEFAULT_PAGE_SIZE), ParseIntPipe) pageSize: number,
  ): Promise<Page<PatientSearchResult>> {
    return this.patients.search(q, pagination(page, pageSize));
  }

  /** GET /patients/:mrn — 404 when there is no such patient. */
  @Get(':mrn')
  findOne(@Param('mrn') mrn: string): Promise<PatientDetail> {
    return this.patients.findByMrn(mrn);
  }
}
