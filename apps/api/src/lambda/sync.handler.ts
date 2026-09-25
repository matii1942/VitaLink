/**
 * The synchronisation job, as an AWS Lambda function on a schedule.
 *
 * This one has no HTTP at all. `createApplicationContext` builds the same
 * dependency graph without an HTTP adapter, controllers or routing, which is
 * both faster to start and honest about what the job is: a scheduled process
 * that talks to the hospital and writes to the database. Nobody calls it.
 *
 * The context is cached across warm invocations, like the API's. The Prisma
 * connection pool lives in it, so a warm run also skips opening connections.
 *
 * SyncService.run() never throws: it catches, records `failed` in the SyncRun
 * row and returns, because a run that leaves no trace is the failure this
 * project is built to prevent. That is right for the service and not enough for
 * the scheduler. A Lambda that returns normally is reported as a success, the
 * schedule moves on, and nothing is watching the table — so the handler reads
 * the status back and throws on a failed run. The row stays the durable record;
 * the thrown error is what makes the invocation visible as a failure to
 * CloudWatch and to anything alarming on it.
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import type { Context, Handler } from 'aws-lambda';

import { AppModule } from '../app.module.js';
import { SyncService } from '../sync/sync.service.js';

const logger = new Logger('SyncHandler');

let cached: INestApplicationContext | undefined;

async function context(): Promise<INestApplicationContext> {
  cached ??= await NestFactory.createApplicationContext(AppModule, {
    // The scheduler is not a person watching a terminal: the useful log lines
    // are what the job did and what went wrong, not Nest's startup banner.
    logger: ['error', 'warn', 'log'],
  });

  return cached;
}

export const handler: Handler = async (_event: unknown, lambdaContext: Context) => {
  const app = await context();
  const sync = app.get(SyncService);

  const run = await sync.run();

  logger.log(
    `Sync ${run.status}: ${run.patientsSynced} patients, ${run.admissionsSynced} admissions, ` +
      `${run.observationsSynced} observations, ${run.observationsRejected} rejected ` +
      `(request ${lambdaContext.awsRequestId})`,
  );

  if (run.status === 'failed') {
    // The row is already written, with the reason in its `errors` column. This
    // throw is for the scheduler, not for the record.
    throw new Error(`Sync run ${run.id} failed. See the errors column of that SyncRun row.`);
  }

  // A partial run wrote real data and also refused some of it. It is not a
  // failure of the job — the rejections are in the row, and the next run picks
  // the records up again — so it returns normally.
  return {
    syncRunId: run.id,
    status: run.status,
    patientsSynced: run.patientsSynced,
    admissionsSynced: run.admissionsSynced,
    observationsSynced: run.observationsSynced,
    observationsRejected: run.observationsRejected,
  };
};
