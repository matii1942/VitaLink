/**
 * The guard between the model and the ward.
 *
 * A language model asked to summarise vital signs will, sooner or later,
 * write a number nobody gave it. Not often, and not obviously: a respiration
 * rate of 22 where the chart says 24, a saturation "improving to 96%" that
 * was never measured. In a handover note that is not a typo, it is a false
 * clinical fact with a plausible shape, and no reader has the chart open
 * beside it to catch it.
 *
 * So every figure in the generated text is checked against the figures that
 * were handed over, and a summary containing one that was not is discarded.
 * Not corrected, not flagged for later — discarded, and the previous summary
 * is served instead. The cost of a rejection is a slightly stale paragraph;
 * the cost of accepting one is a number in a clinical record that came from
 * nowhere.
 *
 * What this does NOT catch, stated plainly because a guard whose limits are
 * unknown is worse than no guard: numbers written as words ("three episodes"
 * of nothing), and wrong claims that contain no numbers at all ("the patient
 * is improving" when the trend is upward). This check makes invented figures
 * impossible and invented prose merely unlikely. The prompt carries the rest,
 * and the summary is labelled as derived text wherever it is served.
 */

/**
 * Every run of digits that is not glued to the end of a word.
 *
 * The lookbehind is what lets the model write "NEWS2" and "SpO2" without the
 * trailing digit being read as a measurement. A number that follows a letter
 * directly is part of a name; a number that follows a space, a bracket or the
 * start of the text is a figure.
 */
const FIGURE = /(?<![A-Za-z])\d+(?:[.,]\d+)?/g;

/** Nothing useful is this long. A runaway answer is a failure, not a summary. */
export const MAX_SUMMARY_CHARACTERS = 1_500;

export interface Verification {
  ok: boolean;
  /** Figures present in the summary that were never in the fact sheet. */
  invented: number[];
  /** Why it failed, ready to be written to the ledger. */
  reason: string | null;
}

export function verifySummary(text: string, allowedNumbers: ReadonlySet<number>): Verification {
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return { ok: false, invented: [], reason: 'The model returned an empty summary.' };
  }

  if (trimmed.length > MAX_SUMMARY_CHARACTERS) {
    return {
      ok: false,
      invented: [],
      reason: `The summary is ${trimmed.length} characters, over the ${MAX_SUMMARY_CHARACTERS} allowed.`,
    };
  }

  const invented = findInventedNumbers(trimmed, allowedNumbers);

  if (invented.length > 0) {
    return {
      ok: false,
      invented,
      reason: `The summary contains ${invented.length} figure(s) absent from the record: ${invented.join(', ')}.`,
    };
  }

  return { ok: true, invented: [], reason: null };
}

export function findInventedNumbers(
  text: string,
  allowedNumbers: ReadonlySet<number>,
): number[] {
  const invented: number[] = [];
  const seen = new Set<number>();

  for (const match of text.matchAll(FIGURE)) {
    // A decimal comma is a decimal point with a different passport. The fact
    // sheet is written in English and uses a point, but the model may not.
    const figure = Number.parseFloat(match[0].replace(',', '.'));

    if (Number.isNaN(figure) || allowedNumbers.has(figure) || seen.has(figure)) {
      continue;
    }

    seen.add(figure);
    invented.push(figure);
  }

  return invented;
}
