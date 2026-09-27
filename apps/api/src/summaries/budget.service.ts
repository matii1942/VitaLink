/**
 * The spending limit, and the ledger it is read from.
 *
 * Two decisions worth stating.
 *
 * The month's spend is a SUM over the LlmCall table, computed fresh on every
 * check, not a running total kept in a column somewhere. A counter has to be
 * maintained, and a counter that is maintained can be missed — by a crash
 * between the call and the increment, by a second process, by a migration
 * that forgets it. A sum cannot drift from the rows it sums. This costs one
 * indexed aggregate per request, on a table that holds a few thousand rows a
 * year.
 *
 * The month is a UTC calendar month, which is deliberately NOT the provider's
 * billing cycle. This is a self-imposed cap whose purpose is to make the
 * worst case knowable, and a limit that resets on an unambiguous boundary is
 * worth more than one that chases an invoice date. The two will disagree at
 * the edges by a few hours; that is a rounding error against a five dollar
 * ceiling, and it is written down here so nobody rediscovers it as a bug.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { LlmConfig, MICRO_USD_PER_USD } from './llm.config.js';

export interface BudgetStatus {
  spentMicroUsd: number;
  limitMicroUsd: number;
  /** Never negative: a limit already exceeded has nothing left, not less. */
  remainingMicroUsd: number;
  /** The start of the month this covers, for the API to report honestly. */
  periodStart: Date;
}

export interface LedgerEntry {
  purpose: string;
  subjectId: string | null;
  model: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  costMicroUsd: number;
  /** succeeded | rejected | failed */
  status: string;
  error: string | null;
  durationMs: number;
}

@Injectable()
export class BudgetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: LlmConfig,
  ) {}

  async status(now: Date = new Date()): Promise<BudgetStatus> {
    const periodStart = monthStart(now);

    const total = await this.prisma.llmCall.aggregate({
      _sum: { costMicroUsd: true },
      where: { createdAt: { gte: periodStart } },
    });

    // Prisma returns null, not zero, when no rows matched: there is no sum of
    // an empty set. Zero is the right answer for a budget.
    const spentMicroUsd = total._sum.costMicroUsd ?? 0;
    const limitMicroUsd = this.config.monthlyBudgetMicroUsd;

    return {
      spentMicroUsd,
      limitMicroUsd,
      remainingMicroUsd: Math.max(0, limitMicroUsd - spentMicroUsd),
      periodStart,
    };
  }

  /**
   * Whether a call whose worst case is `worstCaseMicroUsd` may be made.
   *
   * The comparison is against the worst case, not against an average or the
   * last call's cost. A limit that is only respected on average is a limit
   * that is exceeded regularly.
   */
  async canAfford(
    worstCaseMicroUsd: number,
    now: Date = new Date(),
  ): Promise<{ allowed: boolean; status: BudgetStatus }> {
    const status = await this.status(now);

    return {
      allowed: status.spentMicroUsd + worstCaseMicroUsd <= status.limitMicroUsd,
      status,
    };
  }

  /**
   * Writes one call to the ledger — including the ones that failed.
   *
   * A request the provider billed and then could not complete still cost
   * money. A ledger that records only successes understates the spend in
   * exactly the situation where the limit matters most: a provider having a
   * bad afternoon.
   */
  async record(entry: LedgerEntry): Promise<void> {
    await this.prisma.llmCall.create({ data: entry });
  }
}

/** Midnight on the first of the month, in UTC. */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

/** Millionths of a dollar as dollars, for the API to report. */
export function toUsd(microUsd: number): number {
  // Four decimal places: enough to see a single call, few enough that the
  // figure does not arrive as 0.0023000000000000004.
  return Math.round((microUsd / MICRO_USD_PER_USD) * 10_000) / 10_000;
}
