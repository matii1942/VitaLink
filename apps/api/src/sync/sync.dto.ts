/**
 * What the API says about a synchronisation run.
 *
 * This file exists because `GET /sync/runs` was the one endpoint in the
 * project that answered with the Prisma row, unmapped. That is a seam left
 * open: the database's column names and types become the contract, so
 * renaming a column breaks a consumer, and `errors` arrives as the untyped
 * `Json` that Prisma hands back rather than as the list of issues it really
 * is. Every other endpoint has a view; this one now has one too.
 *
 * `durationMs` is computed here rather than stored. It is a fact about two
 * instants that are already in the row, and storing a derived value is how
 * two fields start disagreeing.
 */
import type { SyncIssue } from './sync.service.js';

export interface SyncRunView {
  id: string;
  startedAt: Date;
  /** Null while the run is still going. */
  finishedAt: Date | null;
  /** running | succeeded | partial | failed */
  status: string;
  /** Null while the run is still going. */
  durationMs: number | null;
  patientsSynced: number;
  admissionsSynced: number;
  observationsSynced: number;
  /** Records the normaliser refused. The reasons are in `issues`. */
  observationsRejected: number;
  scoresComputed: number;
  /** Empty rather than null when a run had nothing to report. */
  issues: SyncIssue[];
}

/** The row as Prisma returns it, restated so this mapper has a shape to take. */
export interface SyncRunRecord {
  id: string;
  startedAt: Date;
  finishedAt: Date | null;
  status: string;
  patientsSynced: number;
  admissionsSynced: number;
  observationsSynced: number;
  observationsRejected: number;
  scoresComputed: number;
  errors: unknown;
}

export function toSyncRunView(record: SyncRunRecord): SyncRunView {
  return {
    id: record.id,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    status: record.status,
    durationMs:
      record.finishedAt === null
        ? null
        : record.finishedAt.getTime() - record.startedAt.getTime(),
    patientsSynced: record.patientsSynced,
    admissionsSynced: record.admissionsSynced,
    observationsSynced: record.observationsSynced,
    observationsRejected: record.observationsRejected,
    scoresComputed: record.scoresComputed,
    issues: toIssues(record.errors),
  };
}

/**
 * A `Json` column is whatever was written into it, and the only honest thing
 * to do with it at the boundary is check.
 *
 * An older run, or one written by a version of this code that no longer
 * exists, can hold anything. Trusting the column's shape here would move a
 * crash from this function — where it is obvious — into a screen rendering a
 * list of undefined.
 */
function toIssues(errors: unknown): SyncIssue[] {
  if (!Array.isArray(errors)) {
    return [];
  }

  return errors.filter(isSyncIssue);
}

function isSyncIssue(value: unknown): value is SyncIssue {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return typeof candidate['record'] === 'string' && typeof candidate['reason'] === 'string';
}
