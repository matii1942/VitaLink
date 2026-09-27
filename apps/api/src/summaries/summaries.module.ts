import { Module } from '@nestjs/common';

import { AnthropicClient } from './anthropic.client.js';
import { BudgetService } from './budget.service.js';
import { LLM_CLIENT } from './llm.client.js';
import { LlmConfig } from './llm.config.js';
import { SummariesController } from './summaries.controller.js';
import { SummariesService } from './summaries.service.js';

/**
 * The provider is bound to the port here and nowhere else.
 *
 * That single line is what the end-to-end tests override to put the fake in
 * its place, and it is the only line that would change to run this against a
 * different provider.
 */
@Module({
  controllers: [SummariesController],
  providers: [
    SummariesService,
    BudgetService,
    LlmConfig,
    { provide: LLM_CLIENT, useClass: AnthropicClient },
  ],
  exports: [SummariesService],
})
export class SummariesModule {}
