import { Injectable, NotFoundException } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client.js';
import { pageOf, type Page, type Pagination } from '../http/pagination.js';
import type { SortOrder } from '../http/query.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  toAdmissionWithPatient,
  toObservationView,
  type AdmissionWithPatient,
  type ObservationView,
} from './admissions.dto.js';

export interface AdmissionFilters {
  ward?: string | undefined;
  /** true: still in a bed. false: already discharged. undefined: both. */
  active?: boolean | undefined;
}

@Injectable()
export class AdmissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of admissions, most recently admitted first, each with its patient.
   *
   * The patient comes along in the same query. A ward list that shows names
   * would otherwise fetch 25 admissions and then 25 patients — and the join is
   * the database's job, not the caller's.
   */
  async list(filters: AdmissionFilters, request: Pagination): Promise<Page<AdmissionWithPatient>> {
    const now = new Date();
    const where = whereFrom(filters);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.admission.findMany({
        where,
        skip: request.skip,
        take: request.take,
        // admissionId breaks ties, so an admission cannot appear on two pages
        // when several were admitted in the same millisecond.
        orderBy: [{ admittedAt: 'desc' }, { admissionId: 'asc' }],
        include: {
          patient: true,
          _count: { select: { observations: true } },
        },
      }),
      this.prisma.admission.count({ where }),
    ]);

    return pageOf(
      rows.map((row) => toAdmissionWithPatient(row, row._count.observations, now)),
      total,
      request,
    );
  }

  /**
   * The vital signs of one admission, each with its NEWS2 score.
   *
   * Newest first by default, which is what a ward wants to see. Ascending is
   * what a chart wants, so the order is a parameter rather than a decision made
   * here for everybody.
   *
   * The query is served by the composite index on (admissionId, recordedAt) —
   * the same index that makes "the latest observation of this admission" cheap.
   */
  async observations(
    admissionId: string,
    order: SortOrder,
    request: Pagination,
  ): Promise<Page<ObservationView>> {
    // Without this, an admission id with a typo would answer 200 and an empty
    // page: "this admission has no observations" instead of "no such admission".
    const admission = await this.prisma.admission.findUnique({
      where: { admissionId },
      select: { admissionId: true },
    });

    if (admission === null) {
      throw new NotFoundException(`No admission with id ${admissionId}.`);
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.observation.findMany({
        where: { admissionId },
        skip: request.skip,
        take: request.take,
        orderBy: [{ recordedAt: order }, { observationId: 'asc' }],
        include: { score: true },
      }),
      this.prisma.observation.count({ where: { admissionId } }),
    ]);

    return pageOf(rows.map(toObservationView), total, request);
  }
}

/**
 * The filters, as a Prisma condition.
 *
 * `active` is not a column: an admission is open when dischargedAt is null.
 * The API exposes the question a consumer actually has, and translates it here.
 */
function whereFrom(filters: AdmissionFilters): Prisma.AdmissionWhereInput {
  const where: Prisma.AdmissionWhereInput = {};

  if (filters.ward !== undefined) {
    where.ward = filters.ward;
  }

  if (filters.active !== undefined) {
    where.dischargedAt = filters.active ? null : { not: null };
  }

  return where;
}
