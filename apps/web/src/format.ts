/**
 * The small conversions every screen needs, in one place and pure, so they
 * can be tested without rendering anything.
 *
 * Each one takes the words it needs rather than reaching for the language
 * itself. That keeps them pure functions — a hook here would make them
 * untestable without a component — and it makes the dependency visible at
 * every call site: a screen that formats a time has to have asked for the
 * strings first.
 */
import type { Strings } from './i18n/strings';

/** "4 h ago", "22 min ago" — what a handover asks, not what a clock says. */
export function timeAgo(iso: string, words: Strings['time'], now: Date = new Date()): string {
  const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000);

  if (minutes < 1) {
    return words.justNow;
  }

  if (minutes < 60) {
    return words.minutes(minutes);
  }

  const hours = Math.round(minutes / 60);

  if (hours < 48) {
    return words.hours(hours);
  }

  return words.days(Math.round(hours / 24));
}

/**
 * The band, spelled the way a person says it.
 *
 * The four NEWS2 bands are not translated and never take a language: they are
 * a Royal College of Physicians standard, used untranslated in Spanish-speaking
 * hospitals the way *shock* and *sepsis* are. The two that are this project's
 * own wording — there is no score, nobody is eligible for one — do take it.
 * See the note at the top of i18n/strings.tsx.
 *
 * This is also the label that carries the meaning. The colour beside it only
 * agrees with it — see the note on the risk custom properties in styles.css.
 */
export function riskLabel(
  risk: string | null,
  status: string | undefined,
  words: Strings['common'],
): string {
  if (status === 'not-eligible') {
    return words.notScored;
  }

  switch (risk) {
    case 'low':
      return 'low';
    case 'low-medium':
      return 'low-medium';
    case 'medium':
      return 'medium';
    case 'high':
      return 'high';
    default:
      return words.noScore;
  }
}

/** male | female | unknown, as the single letter a chart uses. */
export function sexInitial(sex: string, words: Strings['sex']): string {
  switch (sex) {
    case 'male':
      return words.male;
    case 'female':
      return words.female;
    default:
      return words.unknown;
  }
}
