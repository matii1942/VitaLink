import { Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '../generated/prisma/client.js';

import { toAdmissionSummary } from '../admissions/admissions.dto.js';
import { pageOf, type Page, type Pagination } from '../http/pagination.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  toPatientBrief,
  toPatientSummary,
  type PatientDetail,
  type PatientSearchResult,
  type PatientSummary,
} from './patients.dto.js';

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of patients, ordered by name.
   *
   * Two details worth naming:
   *
   * The open-admission count is a filtered relation count inside the same
   * query, not a second query per patient. Asking the database "how many open
   * admissions does this patient have?" once per row is the N+1 problem: 25
   * patients would be 26 round trips.
   *
   * The rows and the total are one transaction, so they are counted against the
   * same snapshot. Run separately, a sync writing rows in between can produce a
   * page of 25 patients alongside a total of 24.
   */
  async list(request: Pagination): Promise<Page<PatientSummary>> {
    const now = new Date();

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.patient.findMany({
        skip: request.skip,
        take: request.take,
        // mrn last, so the order is total: two patients with the same name
        // must not swap places between page 1 and page 2.
        orderBy: [{ familyName: 'asc' }, { givenName: 'asc' }, { mrn: 'asc' }],
        include: {
          _count: { select: { admissions: { where: { dischargedAt: null } } } },
        },
      }),
      this.prisma.patient.count(),
    ]);

    return pageOf(
      rows.map((row) => toPatientSummary(row, row._count.admissions, now)),
      total,
      request,
    );
  }

  /**
   * Patients matching `query`, wherever they are.
   *
   * The ward board answers "who in this ward needs attention first". This
   * answers a different question — "where is this person" — which is the one
   * asked by somebody holding a phone call, and it cannot be answered from a
   * board because the board only knows its own ward, and only the patients
   * currently in a bed.
   *
   * Three things make this a hand-written query rather than a Prisma one.
   *
   * The accents. These are Spanish names, and a nurse under pressure types
   * "vazquez", not "Vázquez". Prisma's case-insensitive mode maps to ILIKE,
   * which folds case and leaves the accent alone, so VÁZQUEZ would not be
   * found. `translate` folds the five vowels and the ene, is built into
   * PostgreSQL and needs no extension — which matters, because the extension
   * that does this properly, `unaccent`, has to be installed by a superuser
   * and the continuous integration database is not one.
   *
   * The whereabouts. The current ward and the latest score come from the same
   * lateral join the board uses (ADR 0010), so a match carries where the
   * person is without a second request per row.
   *
   * The empty search. When nothing is typed the pattern is `%`, which matches
   * every row — so the listing and the search are one query with one code
   * path, rather than two that can drift apart.
   */
  async search(query: string, request: Pagination): Promise<Page<PatientSearchResult>> {
    const now = new Date();
    const pattern = `%${query.trim()}%`;

    const [rows, totals] = await this.prisma.$transaction([
      this.prisma.$queryRaw<SearchRecord[]>`
        SELECT
          p."mrn",
          p."familyName",
          p."givenName",
          p."birthDate",
          p."sex",
          p."news2Scale",
          (
            SELECT COUNT(*)::int
            FROM "Admission" oa
            WHERE oa."mrn" = p."mrn" AND oa."dischargedAt" IS NULL
          ) AS "openAdmissions",
          a."admissionId",
          a."ward",
          a."admittedAt",
          a."transferUnit",
          s."risk",
          s."aggregate"
        FROM "Patient" p
        LEFT JOIN LATERAL (
          SELECT ia.*
          FROM "Admission" ia
          WHERE ia."mrn" = p."mrn" AND ia."dischargedAt" IS NULL
          ORDER BY ia."admittedAt" DESC, ia."admissionId" DESC
          LIMIT 1
        ) a ON TRUE
        LEFT JOIN LATERAL (
          SELECT o."observationId"
          FROM "Observation" o
          WHERE o."admissionId" = a."admissionId"
          ORDER BY o."recordedAt" DESC, o."observationId" DESC
          LIMIT 1
        ) o ON TRUE
        LEFT JOIN "Score" s ON s."observationId" = o."observationId"
        WHERE ${matches(pattern)}
        ORDER BY p."familyName" ASC, p."givenName" ASC, p."mrn" ASC
        LIMIT ${request.take} OFFSET ${request.skip}
      `,
      this.prisma.$queryRaw<[{ total: number }]>`
        SELECT COUNT(*)::int AS "total"
        FROM "Patient" p
        WHERE ${matches(pattern)}
      `,
    ]);

    return pageOf(
      rows.map((row) => toSearchResult(row, now)),
      totals[0]?.total ?? 0,
      request,
    );
  }

  /**
   * One patient with their admission history.
   *
   * Observations are not included: a long admission has hundreds of them, which
   * would make the size of this response depend on how ill the patient has
   * been. They have their own paginated endpoint.
   */
  async findByMrn(mrn: string): Promise<PatientDetail> {
    const patient = await this.prisma.patient.findUnique({
      where: { mrn },
      include: {
        _count: { select: { admissions: { where: { dischargedAt: null } } } },
        admissions: {
          orderBy: { admittedAt: 'desc' },
          include: { _count: { select: { observations: true } } },
        },
      },
    });

    if (patient === null) {
      throw new NotFoundException(`No patient with MRN ${mrn}.`);
    }

    return {
      ...toPatientSummary(patient, patient._count.admissions, new Date()),
      admissions: patient.admissions.map((admission) =>
        toAdmissionSummary(admission, admission._count.observations),
      ),
    };
  }
}

/**
 * The letters `translate` folds, and what it folds them to.
 *
 * Spanish, deliberately and only. This is not a general Unicode normaliser
 * and does not pretend to be one: it covers the accents that appear in the
 * names this hospital sends. A system taking names from another language
 * would need a different answer, and `unaccent` is that answer when a
 * superuser is available to install it.
 */
const ACCENTED = 'áéíóúüñÁÉÍÓÚÜÑ';
const PLAIN = 'aeiouunAEIOUUN';

/**
 * The condition, written once and used by both the page and the count.
 *
 * Both sides of the comparison are folded, so the stored name and the typed
 * one meet in the same alphabet. Folding the pattern as well is what lets
 * somebody type "VÁZQUEZ" and find a row stored without the accent.
 *
 * This cannot use an index: a function over the column means a sequential
 * scan. On a ward of this size that is the right trade, and the moment it
 * stops being right is the moment to measure it and add an index on the
 * expression — not before (ADR 0010).
 */
function matches(pattern: string): Prisma.Sql {
  return Prisma.sql`
    translate(lower(p."familyName" || ' ' || p."givenName" || ' ' || p."mrn"), ${ACCENTED}, ${PLAIN})
      LIKE translate(lower(${pattern}), ${ACCENTED}, ${PLAIN})
  `;
}

/** One flat row of the search query. A raw query has no generated type. */
interface SearchRecord {
  mrn: string;
  familyName: string;
  givenName: string;
  birthDate: Date;
  sex: string;
  news2Scale: number | null;
  openAdmissions: number;
  admissionId: string | null;
  ward: string | null;
  admittedAt: Date | null;
  transferUnit: string | null;
  risk: string | null;
  aggregate: number | null;
}

function toSearchResult(record: SearchRecord, now: Date): PatientSearchResult {
  return {
    ...toPatientBrief(record, now),
    openAdmissions: record.openAdmissions,
    // Three fields are NOT NULL on an admission, so all three being present is
    // how the outer join reports that it matched.
    current:
      record.admissionId === null || record.ward === null || record.admittedAt === null
        ? null
        : {
            admissionId: record.admissionId,
            ward: record.ward,
            admittedAt: record.admittedAt,
            awaitingCriticalCare: record.transferUnit !== null,
            risk: record.risk,
            aggregate: record.aggregate,
          },
  };
}
