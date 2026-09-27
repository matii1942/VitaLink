/**
 * The small conversions every screen needs, in one place and pure, so they
 * can be tested without rendering anything.
 */

/** "4 h ago", "22 min ago" — what a handover asks, not what a clock says. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000);

  if (minutes < 1) {
    return 'just now';
  }

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 48) {
    return `${hours} h ago`;
  }

  return `${Math.round(hours / 24)} d ago`;
}

/**
 * The band, spelled the way a person says it.
 *
 * This is the label that carries the meaning. The colour beside it only
 * agrees with it — see the note on the risk custom properties in styles.css.
 */
export function riskLabel(risk: string | null, status: string | undefined): string {
  if (status === 'not-eligible') {
    return 'not scored';
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
      return 'no score';
  }
}

/** male | female | unknown, as the single letter a chart uses. */
export function sexInitial(sex: string): string {
  switch (sex) {
    case 'male':
      return 'M';
    case 'female':
      return 'F';
    default:
      return '?';
  }
}
