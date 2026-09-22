import { Module } from '@nestjs/common';

import { LegacyHospitalClient, legacyClientConfigFromEnv } from './legacy-client.js';

/**
 * Provides the hospital client. The configuration is read when the
 * application starts, so a missing LEGACY_SOAP_URL stops the application at
 * once instead of surfacing as a failed sync an hour later.
 */
@Module({
  providers: [
    {
      provide: LegacyHospitalClient,
      useFactory: () => new LegacyHospitalClient(legacyClientConfigFromEnv()),
    },
  ],
  exports: [LegacyHospitalClient],
})
export class LegacyModule {}
