/**
 * What the API says about a patient.
 *
 * These shapes are deliberate and they are not the database rows. Three rules
 * are enforced here rather than left to whatever Prisma happens to return:
 *
 *  - `nationalId` never leaves the API. There is no authentication yet, and an
 *    identity number is the one field in this model that identifies a person
 *    outside the hospital. See ADR 0008.
 *  - `createdAt` and `updatedAt` are ours, not the hospital's: they record when
 *    the sync wrote the row, which is nobody else's business.
 *  - a date is sent as a date and an instant as an instant. `birthDate` is
 *    YYYY-MM-DD, because a birthday is a day and not a moment; `admittedAt` is
 *    a full ISO 8601 instant with its zone, because that is a moment in time.
 *
 * The mappers are pure functions and take `now` as an argument, so the age they
 * compute can be tested without waiting for a birthday.
 */
import type { AdmissionSummary } from '../admissions/admissions.dto.js';
import { ageAt } from '../news2/score-observation.js';

/** The fields the mappers need. Structural, so a Prisma row satisfies it. */
export interface PatientRow {
  mrn: string;
  familyName: string;
  givenName: string;
  birthDate: Date;
  sex: string;
  news2Scale: number | null;
}

/**
 * A patient without any counts — small enough to embed inside another
 * resource, so a ward list can show a name without a second request.
 */
export interface PatientBrief {
  mrn: string;
  familyName: string;
  givenName: string;
  /** YYYY-MM-DD. */
  birthDate: string;
  /** Whole years, as of the moment the request was served. */
  age: number;
  sex: string;
  /** Null when the hospital never recorded it; the scorer then assumes 1. */
  news2Scale: number | null;
}

export interface PatientSummary extends PatientBrief {
  /** How many admissions are still open — 0 for a patient who went home. */
  openAdmissions: number;
}

/** A Date holding midnight UTC of a calendar date, back to that date. */
export function toCalendarDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function toPatientBrief(row: PatientRow, now: Date): PatientBrief {
  return {
    mrn: row.mrn,
    familyName: row.familyName,
    givenName: row.givenName,
    birthDate: toCalendarDate(row.birthDate),
    age: ageAt(row.birthDate, now),
    sex: row.sex,
    news2Scale: row.news2Scale,
  };
}

export function toPatientSummary(row: PatientRow, openAdmissions: number, now: Date): PatientSummary {
  return { ...toPatientBrief(row, now), openAdmissions };
}

export interface PatientDetail extends PatientSummary {
  /** Most recent admission first. */
  admissions: AdmissionSummary[];
}

/**
 * Where a patient is right now, for a search that crosses wards.
 *
 * Null when nobody is looking after them at the moment — they went home, or
 * they were never admitted. That is a real answer to "where is this person",
 * and a search that only returned the admitted ones would quietly hide it.
 */
export interface PatientWhereabouts {
  admissionId: string;
  ward: string;
  admittedAt: Date;
  /** True while a critical care bed has been asked for and not appeared. */
  awaitingCriticalCare: boolean;
  /** The band of their most recent score, or null if nobody has measured. */
  risk: string | null;
  /** The aggregate behind that band. Null for the same reasons as `risk`. */
  aggregate: number | null;
}

export interface PatientSearchResult extends PatientBrief {
  openAdmissions: number;
  current: PatientWhereabouts | null;
}
