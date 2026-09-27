import { Controller, Get, Param } from '@nestjs/common';

import { SummariesService } from './summaries.service.js';
import type { SummaryView } from './summaries.dto.js';

/**
 * A read-through cache behind a GET, which deserves a word.
 *
 * A GET is meant to be safe, and this one can spend money and write a row. It
 * is the classic cache-fill exception — the resource is "the current summary
 * of this admission", and producing it is how it is read — but the exception
 * is usually made for a call that is merely slow, not for one that is billed.
 *
 * What makes it defensible here is that the cost is bounded from three sides
 * at once: repeated requests for the same admission cost nothing until a new
 * observation arrives, the monthly budget refuses the call outright once the
 * limit is reached, and the answer is capped before it is asked for. What
 * makes it uncomfortable is that the deployed function has no authentication,
 * so the number of people who can trigger the first request of a round is
 * everyone. That is a Sprint 5 decision recorded in ADR 0015, not an
 * oversight, and it is the first thing to change before this is deployed with
 * a real key.
 */
@Controller('admissions/:admissionId')
export class SummariesController {
  constructor(private readonly summaries: SummariesService) {}

  @Get('summary')
  forAdmission(@Param('admissionId') admissionId: string): Promise<SummaryView> {
    return this.summaries.forAdmission(admissionId);
  }
}
