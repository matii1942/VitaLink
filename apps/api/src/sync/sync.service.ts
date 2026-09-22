import { Injectable, Logger } from '@nestjs/common';

import type { Patient } from '../domain/clinical.js';
import { LegacyHospitalClient, LegacyServiceError } from '../legacy/legacy-client.js';
import {
  NormalizationError,
  normalizeAdmission,
  normalizeObservation,
  normalizePatient,
} from '../legacy/normalize.js';
import { scoreObservation } from '../news2/score-observation.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { withRetry } from './retry.js';
import {
  admissionRow,
  finalStatus,
  observationRow,
  patientRow,
  scoreRow,
} from './sync.mapper.js';

/** One record the run could not take in, and why. */
export interface SyncIssue {
  record: string;
  field?: string;
  reason: string;
}

interface Counts {
  patientsSynced: number;
  admissionsSynced: number;
  observationsSynced: number;
  observationsRejected: number;
  scoresComputed: number;
}

/**
 * Pulls everything the hospital has, normalises it, stores it, and scores
 * every observation.
 *
 * How it treats failure is the point of the design:
 *
 *  - A malformed observation is refused and recorded; the rest of that
 *    patient's observations still go in.
 *  - A client fault on one admission skips that admission; the rest of the
 *    ward still goes in.
 *  - Anything else — the hospital unreachable after retries, the database
 *    down — stops the run and marks it failed.
 *
 * In every case a SyncRun row records what happened. A job that silently
 * does nothing is the most common failure in integration work, and the
 * defence is that every run leaves a trace.
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hospital: LegacyHospitalClient,
  ) {}

  async run() {
    const run = await this.prisma.syncRun.create({ data: { status: 'running' } });
    const counts: Counts = {
      patientsSynced: 0,
      admissionsSynced: 0,
      observationsSynced: 0,
      observationsRejected: 0,
      scoresComputed: 0,
    };
    const issues: SyncIssue[] = [];
    let status: 'succeeded' | 'partial' | 'failed';

    try {
      await this.syncEverything(counts, issues);
      status = finalStatus(issues.length);
    } catch (error) {
      status = 'failed';
      issues.push({ record: 'run', reason: error instanceof Error ? error.message : String(error) });
      this.logger.error(`Sync run ${run.id} failed`, error instanceof Error ? error.stack : undefined);
    }

    const finished = await this.prisma.syncRun.update({
      where: { id: run.id },
      data: {
        ...counts,
        status,
        finishedAt: new Date(),
        errors: issues.length > 0 ? JSON.parse(JSON.stringify(issues)) : undefined,
      },
    });

    this.logger.log(
      `Sync run ${run.id}: ${status} — ${counts.observationsSynced} observations, ` +
        `${counts.scoresComputed} scores, ${issues.length} issues`,
    );
    return finished;
  }

  recentRuns(limit = 10) {
    return this.prisma.syncRun.findMany({ orderBy: { startedAt: 'desc' }, take: limit });
  }

  private async syncEverything(counts: Counts, issues: SyncIssue[]): Promise<void> {
    const admissions = await withRetry(() => this.hospital.listAdmissions());
    const patients = new Map<string, Patient>();

    for (const rawAdmission of admissions) {
      try {
        let patient = patients.get(rawAdmission.mrn);
        if (!patient) {
          patient = normalizePatient(await withRetry(() => this.hospital.getPatient(rawAdmission.mrn)));
          const row = patientRow(patient);
          await this.prisma.patient.upsert({ where: { mrn: row.mrn }, create: row, update: row });
          patients.set(patient.mrn, patient);
          counts.patientsSynced += 1;
        }

        const admission = normalizeAdmission(rawAdmission);
        const admissionData = admissionRow(admission);
        await this.prisma.admission.upsert({
          where: { admissionId: admissionData.admissionId },
          create: admissionData,
          update: admissionData,
        });
        counts.admissionsSynced += 1;

        const rawObservations = await withRetry(() =>
          this.hospital.getObservations(admission.admissionId),
        );

        for (const raw of rawObservations) {
          let observation;
          try {
            observation = normalizeObservation(raw);
          } catch (error) {
            if (!(error instanceof NormalizationError)) throw error;
            counts.observationsRejected += 1;
            issues.push({ record: raw.observationId, field: error.field, reason: error.message });
            continue;
          }

          const observationData = observationRow(observation);
          await this.prisma.observation.upsert({
            where: { observationId: observationData.observationId },
            create: observationData,
            update: observationData,
          });
          counts.observationsSynced += 1;

          const scoreData = scoreRow(scoreObservation(patient, observation));
          await this.prisma.score.upsert({
            where: { observationId: scoreData.observationId },
            create: scoreData,
            update: scoreData,
          });
          counts.scoresComputed += 1;
        }
      } catch (error) {
        const skippable =
          error instanceof NormalizationError ||
          (error instanceof LegacyServiceError && !error.retryable);
        if (!skippable) throw error;

        issues.push({
          record: rawAdmission.admissionId,
          field: error instanceof NormalizationError ? error.field : undefined,
          reason: error.message,
        });
      }
    }
  }
}
