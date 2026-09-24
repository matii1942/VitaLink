import { Injectable, NotFoundException } from '@nestjs/common';

import {
  toAdmissionSummary,
  toObservationView,
  type ObservationView,
} from '../admissions/admissions.dto.js';
import { toPatientBrief } from '../patients/patients.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { WardBoard, WardBoardRow, WardSummary } from './wards.dto.js';

/**
 * How the board is sorted, in words, and sent to the consumer with the rows.
 */
const ORDERED_BY =
  'waiting for a critical care bed, then risk (high, medium, low-medium), then admissions with no observation, then unscored, then low; ties by aggregate, then by the oldest reading';

/**
 * One flat row of the board query.
 *
 * Written out because the query is written out: a raw query has no generated
 * type, and inventing one with `any` would hand back the safety the rest of the
 * project pays for. The observation and score fields are all nullable because
 * both are outer joins — a patient admitted ten minutes ago has neither.
 *
 * The instants are typed `Date | string`. A raw query has no generated type, so
 * nothing guarantees how the driver deserialises a timestamptz; it hands back a
 * Date, but that is the driver's behaviour and not a promise of the schema.
 * asInstant accepts either, so a change there is not a crash here.
 */
interface BoardRecord {
  admissionId: string;
  mrn: string;
  admittedAt: Date | string;
  dischargedAt: Date | string | null;
  dischargeDestination: string | null;
  transferUnit: string | null;
  transferRequestedAt: Date | string | null;
  ward: string;
  admissionType: string;
  sourceUnit: string | null;
  diagnosis: string | null;
  firstAdmission: boolean;
  observationCount: number;

  familyName: string;
  givenName: string;
  /** Text, not a Date, on purpose. See toBirthDate below. */
  birthDateText: string;
  sex: string;
  news2Scale: number | null;

  observationId: string | null;
  recordedAt: Date | string | null;
  respirationRate: number | null;
  oxygenSaturation: number | null;
  respiratorySupport: string | null;
  systolicBP: number | null;
  pulse: number | null;
  gcsEye: number | null;
  gcsVerbal: number | null;
  gcsMotor: number | null;
  gcsTotal: number | null;
  temperature: number | null;
  recordedBy: string | null;

  status: string | null;
  notEligibleReason: string | null;
  aggregate: number | null;
  risk: string | null;
  partial: boolean | null;
  redScore: boolean | null;
  scaleUsed: number | null;
  scaleSource: string | null;
  respirationRateScore: number | null;
  oxygenSaturationScore: number | null;
  supplementalOxygenScore: number | null;
  systolicBPScore: number | null;
  pulseScore: number | null;
  consciousnessScore: number | null;
  temperatureScore: number | null;
  missing: string[] | null;
  engineVersion: string | null;
  computedAt: Date | string | null;
}

@Injectable()
export class WardsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The wards, derived from the data rather than from a list kept here.
   *
   * VitaLink does not decide which wards a hospital has. A closed list in this
   * codebase would turn the opening of a ward into a deployment, and a typo in
   * the source into an invisible dropped record.
   *
   * COUNT is cast to int because PostgreSQL counts in bigint, which arrives as
   * a JavaScript BigInt — and JSON.stringify throws on those.
   */
  async list(): Promise<WardSummary[]> {
    return this.prisma.$queryRaw<WardSummary[]>`
      SELECT
        a.ward,
        (COUNT(*) FILTER (WHERE a."dischargedAt" IS NULL))::int AS "openAdmissions",
        (COUNT(*))::int AS "totalAdmissions"
      FROM "Admission" a
      GROUP BY a.ward
      ORDER BY a.ward
    `;
  }

  /**
   * Every patient currently in a ward, with their most recent vital signs and
   * the NEWS2 score of those signs, most concerning first.
   *
   * The rows a consumer must not miss come first: a patient whose critical
   * care bed has been asked for and has not appeared outranks every score,
   * because that is the person somebody is already on the phone about.
   *
   * This is one query, and it is written by hand for two reasons.
   *
   * The first is "the latest observation of each admission". Asking for that by
   * fetching every observation and keeping the newest per admission reads the
   * whole history of the ward to use one row of it. Asking for it per admission
   * is the N+1 problem. LEFT JOIN LATERAL ... LIMIT 1 asks the database to look
   * up one row per admission, and the index on (admissionId, recordedAt) makes
   * each of those a single seek.
   *
   * The second is the LEFT: an admission with no observations yet stays on the
   * board. A ward board that silently hides the patient nobody has taken the
   * vital signs of would hide exactly the patient somebody needs to see. That is
   * also why they sort above the patients scored low rather than at the bottom:
   * "not measured" is a thing to act on, not a thing to ignore.
   *
   * DISTINCT ON (admissionId) would also produce one row per admission, and is
   * the better tool when you want the latest row of every group in a table. Here
   * the outer rows have to survive having no match, which DISTINCT ON cannot do.
   */
  async board(ward: string): Promise<WardBoard> {
    const records = await this.prisma.$queryRaw<BoardRecord[]>`
      SELECT
        a."admissionId",
        a."mrn",
        a."admittedAt",
        a."dischargedAt",
        a."dischargeDestination",
        a."transferUnit",
        a."transferRequestedAt",
        a."ward",
        a."admissionType",
        a."sourceUnit",
        a."diagnosis",
        a."firstAdmission",
        (
          SELECT COUNT(*)::int
          FROM "Observation" oc
          WHERE oc."admissionId" = a."admissionId"
        ) AS "observationCount",

        p."familyName",
        p."givenName",
        to_char(p."birthDate", 'YYYY-MM-DD') AS "birthDateText",
        p."sex",
        p."news2Scale",

        o."observationId",
        o."recordedAt",
        o."respirationRate",
        o."oxygenSaturation",
        o."respiratorySupport",
        o."systolicBP",
        o."pulse",
        o."gcsEye",
        o."gcsVerbal",
        o."gcsMotor",
        o."gcsTotal",
        o."temperature",
        o."recordedBy",

        s."status",
        s."notEligibleReason",
        s."aggregate",
        s."risk",
        s."partial",
        s."redScore",
        s."scaleUsed",
        s."scaleSource",
        s."respirationRateScore",
        s."oxygenSaturationScore",
        s."supplementalOxygenScore",
        s."systolicBPScore",
        s."pulseScore",
        s."consciousnessScore",
        s."temperatureScore",
        s."missing",
        s."engineVersion",
        s."computedAt"
      FROM "Admission" a
      JOIN "Patient" p ON p."mrn" = a."mrn"
      LEFT JOIN LATERAL (
        SELECT *
        FROM "Observation" inner_o
        WHERE inner_o."admissionId" = a."admissionId"
        ORDER BY inner_o."recordedAt" DESC, inner_o."observationId" DESC
        LIMIT 1
      ) o ON TRUE
      LEFT JOIN "Score" s ON s."observationId" = o."observationId"
      WHERE a."ward" = ${ward}
        AND a."dischargedAt" IS NULL
      ORDER BY
        CASE
          -- A bed has been asked for and has not appeared. This patient is
          -- physically in the ward and is the reason somebody is on the phone
          -- to intensive care, so they come before every score.
          WHEN a."transferUnit" IS NOT NULL THEN 6
          WHEN s."risk" = 'high' THEN 5
          WHEN s."risk" = 'medium' THEN 4
          WHEN s."risk" = 'low-medium' THEN 3
          WHEN o."observationId" IS NULL THEN 2
          WHEN s."risk" IS NULL THEN 1
          ELSE 0
        END DESC,
        s."aggregate" DESC NULLS LAST,
        -- Within the same risk, the oldest reading first: that is the patient
        -- whose numbers are most likely to be out of date.
        o."recordedAt" ASC NULLS FIRST,
        a."admissionId" ASC
    `;

    // An unknown ward and an empty ward are different answers, and only the
    // empty result needs a second question asked.
    if (records.length === 0 && !(await this.wardExists(ward))) {
      throw new NotFoundException(`No ward called ${ward}.`);
    }

    const now = new Date();

    return {
      ward,
      generatedAt: now.toISOString(),
      openAdmissions: records.length,
      orderedBy: ORDERED_BY,
      rows: records.map((record) => toBoardRow(record, now)),
    };
  }

  /** Whether any admission has ever been recorded for this ward. */
  private async wardExists(ward: string): Promise<boolean> {
    const found = await this.prisma.admission.findFirst({
      where: { ward },
      select: { admissionId: true },
    });

    return found !== null;
  }
}

function toBoardRow(record: BoardRecord, now: Date): WardBoardRow {
  return {
    ...toAdmissionSummary(
      {
        ...record,
        admittedAt: asInstant(record.admittedAt),
        dischargedAt: record.dischargedAt === null ? null : asInstant(record.dischargedAt),
        transferRequestedAt:
          record.transferRequestedAt === null ? null : asInstant(record.transferRequestedAt),
      },
      record.observationCount,
    ),
    patient: toPatientBrief(
      {
        mrn: record.mrn,
        familyName: record.familyName,
        givenName: record.givenName,
        birthDate: toBirthDate(record.birthDateText),
        sex: record.sex,
        news2Scale: record.news2Scale,
      },
      now,
    ),
    latestObservation: toLatestObservation(record),
  };
}

/** A value from a raw query that should be an instant, as a Date. */
function asInstant(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * A YYYY-MM-DD string back to midnight UTC of that day.
 *
 * The birth date is selected as text and rebuilt here rather than read as a
 * date, because a PostgreSQL `date` arriving through the driver becomes a Date
 * at *local* midnight. In Buenos Aires, at UTC-3, that reads back as the right
 * day; in any zone east of Greenwich it reads back as the day before. Selecting
 * text removes the local clock from the path entirely.
 */
function toBirthDate(text: string): Date {
  return new Date(`${text}T00:00:00.000Z`);
}

function toLatestObservation(record: BoardRecord): ObservationView | null {
  // These four are NOT NULL on the observation, so all four being present is
  // how the outer join reports that it matched.
  if (
    record.observationId === null ||
    record.recordedAt === null ||
    record.respiratorySupport === null ||
    record.gcsTotal === null
  ) {
    return null;
  }

  const score =
    record.status === null ||
    record.engineVersion === null ||
    record.computedAt === null ||
    record.missing === null
      ? null
      : {
          status: record.status,
          notEligibleReason: record.notEligibleReason,
          aggregate: record.aggregate,
          risk: record.risk,
          partial: record.partial,
          redScore: record.redScore,
          scaleUsed: record.scaleUsed,
          scaleSource: record.scaleSource,
          respirationRateScore: record.respirationRateScore,
          oxygenSaturationScore: record.oxygenSaturationScore,
          supplementalOxygenScore: record.supplementalOxygenScore,
          systolicBPScore: record.systolicBPScore,
          pulseScore: record.pulseScore,
          consciousnessScore: record.consciousnessScore,
          temperatureScore: record.temperatureScore,
          missing: record.missing,
          engineVersion: record.engineVersion,
          computedAt: asInstant(record.computedAt),
        };

  return toObservationView({
    observationId: record.observationId,
    admissionId: record.admissionId,
    recordedAt: asInstant(record.recordedAt),
    respirationRate: record.respirationRate,
    oxygenSaturation: record.oxygenSaturation,
    respiratorySupport: record.respiratorySupport,
    systolicBP: record.systolicBP,
    pulse: record.pulse,
    gcsEye: record.gcsEye,
    gcsVerbal: record.gcsVerbal,
    gcsMotor: record.gcsMotor,
    gcsTotal: record.gcsTotal,
    temperature: record.temperature,
    recordedBy: record.recordedBy,
    score,
  });
}
