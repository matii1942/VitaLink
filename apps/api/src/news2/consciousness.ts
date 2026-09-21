/**
 * Glasgow Coma Scale -> ACVPU, as fixed in ADR 0006.
 *
 * The conversion reads the components, never the total: two patients with a
 * total of 11 can have reached it in ways that mean different things at the
 * bedside, and telling V from P depends on the eye-opening component alone.
 */

import type { GlasgowComaScale } from '../domain/clinical.js';
import type { Acvpu } from './news2.js';

/**
 * @returns the ACVPU level, or null when the components are absent — records
 *          migrated from the previous system kept only the total (ADR 0004).
 */
export function glasgowToAcvpu(gcs: GlasgowComaScale): Acvpu | null {
  const { eye, verbal, motor } = gcs;
  if (eye === null || verbal === null || motor === null) return null;

  if (eye === 4) return verbal === 5 ? 'A' : 'C';
  if (eye === 3) return 'V';
  if (eye === 2) return 'P';

  // Eyes closed. Any verbal or motor response to a stimulus is still a
  // response to pain; only a complete absence of response is U.
  return verbal === 1 && motor === 1 ? 'U' : 'P';
}
