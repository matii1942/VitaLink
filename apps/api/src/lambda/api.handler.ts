/**
 * The read API, as an AWS Lambda function.
 *
 * The application is not rewritten for Lambda: this wraps the same AppModule
 * the server runs, so there is one application with two ways of being started.
 * A deployment that runs different code from the one under test is a
 * deployment nobody can reason about.
 *
 * The Nest application is built once and kept in module scope. Lambda reuses a
 * warm execution environment across invocations, so the second request onward
 * skips the whole bootstrap — the dependency graph, the controllers, the Prisma
 * client. Building it inside the handler would pay that cost on every request.
 *
 * Nothing here reads .env. On Lambda the variables come from the function's
 * own configuration, which is what src/config/env.ts already prefers: dotenv
 * never overwrites a variable that is already set, and there is no file to
 * read anyway.
 */
import { NestFactory } from '@nestjs/core';
// Named import, not default: the package is CommonJS, so at run time its
// module.exports IS the function and there is no `.default` on it. Its type
// declarations say `export default configure` and also export `configure` by
// name — the named one is the spelling that is true in both worlds.
import { configure as serverlessExpress } from '@codegenie/serverless-express';
import type { Callback, Context, Handler } from 'aws-lambda';

import { AppModule } from '../app.module.js';

let cached: Handler | undefined;

async function bootstrap(): Promise<Handler> {
  const app = await NestFactory.create(AppModule);
  await app.init();

  return serverlessExpress({ app: app.getHttpAdapter().getInstance() });
}

export const handler: Handler = async (
  event: unknown,
  context: Context,
  callback: Callback,
) => {
  cached ??= await bootstrap();
  return cached(event, context, callback);
};
