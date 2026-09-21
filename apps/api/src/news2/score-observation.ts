/**
 * From a clinical observation to a NEWS2 score.
 *
 * This is where the clinical decisions recorded in the ADRs are applied, so
 * that the engine in news2.ts can stay a plain transcription of the chart:
 *
 *  - patients under 16 are not scored (ADR 0005)
 *  - a missing scale defaults to Scale 1, and the default is recorded (ADR 0003)
 *  - consciousness is converted from Glasgow components (ADR 0006)
 *  - any respiratory support other than room air counts as supplemental oxygen
 */

import type { Observation, Patient } from '../domain/clinical.js';
import { glasgowToAcvpu } from './consciousness.js';
import { calculateNews2 } from './news2.js';
import type { News2Result } from './news2.js';

export const MINIMUM_AGE = 16;

export type ObservationScore =
  | {
      observationId: string;
      status: 'scored';
      result: News2Result;
      /** 'assumed' when the patient had no recorded scale (ADR 0003). */
      scaleSource: 'recorded' | 'assumed';
    }
  | {
      observationId: string;
      status: 'not-eligible';
      reason: 'under-16';
    };

/** Whole years between two instants, counted on the UTC calendar. */
export function ageAt(birthDate: Date, at: Date): number {
  let age = at.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    at.getUTCMonth() < birthDate.getUTCMonth() ||
    (at.getUTCMonth() === birthDate.getUTCMonth() && at.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function scoreObservation(patient: Patient, observation: Observation): ObservationScore {
  if (ageAt(patient.birthDate, observation.recordedAt) < MINIMUM_AGE) {
    return { observationId: observation.observationId, status: 'not-eligible', reason: 'under-16' };
  }

  const result = calculateNews2({
    respirationRate: observation.respirationRate,
    oxygenSaturation: observation.oxygenSaturation,
    onOxygen: observation.respiratorySupport !== 'room-air',
    systolicBP: observation.systolicBP,
    pulse: observation.pulse,
    consciousness: glasgowToAcvpu(observation.gcs),
    temperature: observation.temperature,
    scale: patient.news2Scale ?? 1,
  });

  return {
    observationId: observation.observationId,
    status: 'scored',
    result,
    scaleSource: patient.news2Scale === null ? 'assumed' : 'recorded',
  };
}
