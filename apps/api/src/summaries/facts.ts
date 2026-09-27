/**
 * The fact sheet: everything the model is allowed to know, and — from the
 * same pass — every number it is allowed to write.
 *
 * Those two things are produced together on purpose. The verification in
 * verify.ts rejects any figure in the generated text that was not handed to
 * the model, and that check is only as good as its list. If the list were
 * built by a second function reading the same rows again, the two could drift
 * apart on the day someone adds a field to one and forgets the other, and the
 * failure would be silent in the worst possible direction: a summary with an
 * invented vital sign, passing verification.
 *
 * So there is one function. A number reaches the prompt by being written down
 * here, and being written down here is what puts it on the list.
 *
 * Nothing in this file touches Prisma. It takes plain rows and returns plain
 * text, which is why the shape of a handover note can be worked out in unit
 * tests that run in milliseconds and cost nothing.
 */

export interface FactPatient {
  familyName: string;
  givenName: string;
  ageYears: number;
  /** male | female | unknown */
  sex: string;
}

export interface FactAdmission {
  admittedAt: Date;
  ward: string;
  /** urgent | scheduled */
  admissionType: string;
  /** emergency | theatre | cathlab | transfer, or null when admitted from home. */
  sourceUnit: string | null;
  diagnosis: string | null;
  /** intensive-care | coronary-care, when a bed was asked for (ADR 0009). */
  transferUnit: string | null;
}

export interface FactScore {
  /** scored | not-eligible */
  status: string;
  notEligibleReason: string | null;
  aggregate: number | null;
  /** low | low-medium | medium | high */
  risk: string | null;
  partial: boolean | null;
  redScore: boolean | null;
  missing: string[];
}

export interface FactObservation {
  observationId: string;
  recordedAt: Date;
  respirationRate: number | null;
  oxygenSaturation: number | null;
  /** room-air | cannula | mask | cpap | niv */
  respiratorySupport: string;
  systolicBP: number | null;
  pulse: number | null;
  gcsTotal: number;
  temperature: number | null;
  score: FactScore | null;
}

export interface FactSheet {
  /** The text handed to the model, verbatim. */
  text: string;
  /**
   * Every number that appears in `text`, as a number. The verifier compares
   * against this and nothing else.
   */
  allowedNumbers: Set<number>;
  /** How many rounds of observations went in. Bounds the cost. */
  roundsUsed: number;
  /** The newest observation covered — the cache watermark. */
  through: { observationId: string; recordedAt: Date };
}

export interface FactSheetInput {
  patient: FactPatient;
  admission: FactAdmission;
  /** Newest first, already limited to the rounds that will be sent. */
  observations: FactObservation[];
  /** The instant the sheet is written, for the relative times. */
  now: Date;
}

const MILLISECONDS_PER_HOUR = 3_600_000;

/**
 * Builds the sheet.
 *
 * Times are relative — "4 hours ago" — rather than absolute. Three reasons,
 * in order of how much trouble each one saves. A handover is read in terms of
 * how long ago something happened, not at what o'clock. An absolute timestamp
 * would have to be rendered in some zone, and choosing one here would put a
 * time-zone decision in a prompt, which is the last place anybody would look
 * for it. And a full timestamp drags five more numbers per line onto the
 * allowed list, every one of them a number the model may then legitimately
 * repeat in a sentence where it means nothing.
 */
export function buildFactSheet(input: FactSheetInput): FactSheet {
  const { patient, admission, observations, now } = input;

  if (observations.length === 0) {
    throw new Error('A fact sheet needs at least one observation.');
  }

  const numbers = new NumberCollector();
  const lines: string[] = [];

  const dayOfStay = numbers.keep(
    Math.max(1, Math.floor((now.getTime() - admission.admittedAt.getTime()) / MILLISECONDS_PER_HOUR / 24) + 1),
  );

  lines.push('PATIENT');
  lines.push(`name: ${patient.givenName} ${patient.familyName}`);
  lines.push(`age: ${numbers.keep(patient.ageYears)} years`);
  lines.push(`sex: ${patient.sex}`);
  lines.push('');
  lines.push('ADMISSION');
  lines.push(`ward: ${admission.ward}`);
  lines.push(`type: ${admission.admissionType}`);
  lines.push(`admitted from: ${admission.sourceUnit ?? 'home'}`);
  lines.push(`day of stay: ${dayOfStay}`);
  lines.push(`diagnosis: ${admission.diagnosis ?? 'not recorded'}`);
  lines.push(
    admission.transferUnit === null
      ? 'critical care bed requested: no'
      : `critical care bed requested: yes, ${admission.transferUnit}, and the patient is still in the ward`,
  );

  const oldest = observations[observations.length - 1] as FactObservation;
  const hoursCovered = numbers.keep(hoursBetween(oldest.recordedAt, now));

  lines.push('');
  lines.push(
    `OBSERVATIONS — ${numbers.keep(observations.length)} rounds covering the last ${hoursCovered} hours, most recent first`,
  );

  observations.forEach((observation, index) => {
    lines.push(`[${numbers.keep(index + 1)}] ${observationLine(observation, now, numbers)}`);
  });

  const newest = observations[0] as FactObservation;

  return {
    text: lines.join('\n'),
    allowedNumbers: numbers.collected,
    roundsUsed: observations.length,
    through: { observationId: newest.observationId, recordedAt: newest.recordedAt },
  };
}

function observationLine(
  observation: FactObservation,
  now: Date,
  numbers: NumberCollector,
): string {
  const parts: string[] = [`${numbers.keep(hoursBetween(observation.recordedAt, now))} hours ago`];

  parts.push(scoreText(observation.score, numbers));
  parts.push(`respiration rate ${value(observation.respirationRate, numbers)}`);
  parts.push(
    `oxygen saturation ${value(observation.oxygenSaturation, numbers)}% on ${observation.respiratorySupport}`,
  );
  parts.push(`systolic blood pressure ${value(observation.systolicBP, numbers)}`);
  parts.push(`pulse ${value(observation.pulse, numbers)}`);
  parts.push(`Glasgow ${numbers.keep(observation.gcsTotal)}`);
  parts.push(`temperature ${value(observation.temperature, numbers)}`);

  return parts.join(' | ');
}

/**
 * A score, in words.
 *
 * A missing parameter is stated rather than hidden. An aggregate built from
 * six of seven rows is a lower bound, and a handover that presents it as a
 * total invites exactly the wrong kind of reassurance.
 */
function scoreText(score: FactScore | null, numbers: NumberCollector): string {
  if (score === null) {
    return 'NEWS2 not yet calculated';
  }

  if (score.status !== 'scored' || score.aggregate === null) {
    return `NEWS2 not applicable (${score.notEligibleReason ?? 'reason not recorded'})`;
  }

  const notes: string[] = [`${score.risk ?? 'risk not recorded'} risk`];

  if (score.redScore === true) {
    notes.push('single parameter scoring 3, escalate regardless of the total');
  }

  if (score.partial === true) {
    notes.push(`lower bound only, missing ${score.missing.map(parameterName).join(' and ')}`);
  }

  return `NEWS2 ${numbers.keep(score.aggregate)} (${notes.join('; ')})`;
}

/**
 * A scorer field name, as a clinician would say it.
 *
 * The NEWS2 engine names its parameters after the columns it reads. Those
 * names are correct inside the code and wrong inside a handover note: nobody
 * writes "missing systolicBP" on a chart. Anything unmapped falls through
 * unchanged rather than being dropped — an unfamiliar parameter is still
 * information, and losing it silently would be worse than printing it oddly.
 */
const PARAMETER_NAMES: Record<string, string> = {
  respirationRate: 'respiration rate',
  oxygenSaturation: 'oxygen saturation',
  supplementalOxygen: 'supplemental oxygen',
  systolicBP: 'systolic blood pressure',
  pulse: 'pulse',
  consciousness: 'consciousness',
  temperature: 'temperature',
};

function parameterName(field: string): string {
  return PARAMETER_NAMES[field] ?? field;
}

function value(measurement: number | null, numbers: NumberCollector): string {
  return measurement === null ? 'not recorded' : String(numbers.keep(measurement));
}

function hoursBetween(earlier: Date, later: Date): number {
  return Math.max(0, Math.round((later.getTime() - earlier.getTime()) / MILLISECONDS_PER_HOUR));
}

/**
 * Writes a number into the sheet and onto the allowed list in one movement.
 *
 * `keep` returns what it was given, so it can be used inline inside the
 * template that renders the line. That is the whole trick: there is no way to
 * put a number in the text without passing it through here.
 */
class NumberCollector {
  readonly collected = new Set<number>();

  keep(value: number): number {
    this.collected.add(value);
    return value;
  }
}
