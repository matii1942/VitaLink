/**
 * The read-through cache, the budget gate and the guard, in the order they
 * are consulted.
 *
 * The shape of this file is one decision repeated: at every step where
 * something can go wrong, serve the last good summary rather than an error.
 * A ward screen that shows a paragraph from four hours ago, labelled as
 * being from four hours ago, is useful. The same screen showing a red box is
 * not, and the raw observations are on the same page either way.
 *
 * The one thing that is never done is serving text that failed verification.
 * Degrading to something older is a compromise; degrading to something
 * invented is not a compromise, it is the failure this whole sprint exists
 * to prevent.
 */
import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { ageAt } from '../news2/score-observation.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BudgetService, toUsd, type BudgetStatus } from './budget.service.js';
import { buildFactSheet, type FactObservation } from './facts.js';
import { LLM_CLIENT, worstCaseCostOf, costOf, type LlmClient } from './llm.client.js';
import { LlmConfig } from './llm.config.js';
import { PROMPT_VERSION, buildRequest } from './prompt.js';
import {
  toSummaryView,
  type BudgetView,
  type StoredSummary,
  type SummaryView,
} from './summaries.dto.js';
import { verifySummary } from './verify.js';

const PURPOSE = 'summary';

@Injectable()
export class SummariesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly budget: BudgetService,
    private readonly config: LlmConfig,
    @Inject(LLM_CLIENT) private readonly llm: LlmClient,
  ) {}

  async forAdmission(admissionId: string, now: Date = new Date()): Promise<SummaryView> {
    const admission = await this.prisma.admission.findUnique({
      where: { admissionId },
      include: {
        patient: true,
        observations: {
          // Newest first, then cut. The composite index on
          // (admissionId, recordedAt) serves this without a sort.
          orderBy: [{ recordedAt: 'desc' }, { observationId: 'asc' }],
          take: this.config.observationRounds,
          include: { score: true },
        },
      },
    });

    if (admission === null) {
      throw new NotFoundException(`No admission with id ${admissionId}.`);
    }

    const stored = await this.prisma.summary.findUnique({ where: { admissionId } });
    const budget = await this.budget.status(now);

    const newest = admission.observations[0];

    if (newest === undefined) {
      // Nothing has been measured. There is nothing to summarise, and the
      // honest answer is to say so rather than to write a paragraph about an
      // empty chart.
      return this.view(admissionId, stored, budget, 'This admission has no observations yet.');
    }

    // The whole cache policy, in one comparison: the summary is current when
    // it was written from the observation that is still the newest one, by
    // the prompt that is still in force. No clock is consulted.
    if (
      stored !== null &&
      stored.throughObservationId === newest.observationId &&
      stored.promptVersion === PROMPT_VERSION
    ) {
      return toSummaryView(admissionId, stored, 'current', null, toBudgetView(budget));
    }

    if (!this.config.configured) {
      return this.view(admissionId, stored, budget, 'No model is configured.');
    }

    const sheet = buildFactSheet({
      patient: {
        familyName: admission.patient.familyName,
        givenName: admission.patient.givenName,
        ageYears: ageAt(admission.patient.birthDate, now),
        sex: admission.patient.sex,
      },
      admission: {
        admittedAt: admission.admittedAt,
        ward: admission.ward,
        admissionType: admission.admissionType,
        sourceUnit: admission.sourceUnit,
        diagnosis: admission.diagnosis,
        // Only while the patient is still here. A bed request kept after
        // discharge is history, not a handover instruction (ADR 0009).
        transferUnit: admission.dischargedAt === null ? admission.transferUnit : null,
      },
      observations: admission.observations as FactObservation[],
      now,
    });

    const request = buildRequest(sheet.text, this.config.maxOutputTokens);
    const worstCase = worstCaseCostOf(request, this.llm.pricing);
    const affordable = await this.budget.canAfford(worstCase, now);

    if (!affordable.allowed) {
      return this.view(
        admissionId,
        stored,
        affordable.status,
        `The monthly budget of ${toUsd(affordable.status.limitMicroUsd)} dollars is spent.`,
      );
    }

    const startedAt = Date.now();
    let answer;

    try {
      answer = await this.llm.complete(request);
    } catch (error) {
      await this.budget.record({
        purpose: PURPOSE,
        subjectId: admissionId,
        model: this.llm.model,
        promptVersion: PROMPT_VERSION,
        inputTokens: 0,
        outputTokens: 0,
        // A call that never came back may still have been billed. Charging
        // the worst case to the ledger keeps the limit honest in the only
        // direction that is safe to be wrong in.
        costMicroUsd: worstCase,
        status: 'failed',
        error: messageOf(error),
        durationMs: Date.now() - startedAt,
      });

      return this.view(admissionId, stored, budget, 'The model could not be reached.');
    }

    const durationMs = Date.now() - startedAt;
    const cost = costOf(answer, this.llm.pricing);
    const verdict = verifySummary(answer.text, sheet.allowedNumbers);

    if (!verdict.ok) {
      // Billed, and thrown away. That is the correct trade and the ledger
      // records both halves of it, so the rejection rate is a number this
      // project can look up rather than a feeling.
      await this.budget.record({
        purpose: PURPOSE,
        subjectId: admissionId,
        model: answer.model,
        promptVersion: PROMPT_VERSION,
        inputTokens: answer.inputTokens,
        outputTokens: answer.outputTokens,
        costMicroUsd: cost,
        status: 'rejected',
        error: verdict.reason,
        durationMs,
      });

      return this.view(admissionId, stored, budget, 'The generated summary failed verification.');
    }

    await this.budget.record({
      purpose: PURPOSE,
      subjectId: admissionId,
      model: answer.model,
      promptVersion: PROMPT_VERSION,
      inputTokens: answer.inputTokens,
      outputTokens: answer.outputTokens,
      costMicroUsd: cost,
      status: 'succeeded',
      error: null,
      durationMs,
    });

    const data = {
      text: answer.text.trim(),
      throughObservationId: sheet.through.observationId,
      throughRecordedAt: sheet.through.recordedAt,
      roundsUsed: sheet.roundsUsed,
      model: answer.model,
      promptVersion: PROMPT_VERSION,
      generatedAt: new Date(),
    };

    const saved = await this.prisma.summary.upsert({
      where: { admissionId },
      create: { admissionId, ...data },
      update: data,
    });

    // The budget read at the top of the request is now one call out of date.
    return toSummaryView(
      admissionId,
      saved,
      'current',
      null,
      toBudgetView(await this.budget.status(now)),
    );
  }

  /** Whatever was last written, labelled with why it is not being refreshed. */
  private view(
    admissionId: string,
    stored: StoredSummary | null,
    budget: BudgetStatus,
    reason: string,
  ): SummaryView {
    return toSummaryView(
      admissionId,
      stored,
      stored === null ? 'unavailable' : 'stale',
      reason,
      toBudgetView(budget),
    );
  }
}

function toBudgetView(status: BudgetStatus): BudgetView {
  return {
    spentUsd: toUsd(status.spentMicroUsd),
    limitUsd: toUsd(status.limitMicroUsd),
    remainingUsd: toUsd(status.remainingMicroUsd),
    periodStart: status.periodStart.toISOString(),
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
