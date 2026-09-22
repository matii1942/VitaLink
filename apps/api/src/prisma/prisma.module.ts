import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service.js';

/** Global: every module that needs the database gets the same client. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
