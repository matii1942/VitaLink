/**
 * The demo build: the same screens, reading a recorded answer instead of a
 * live one.
 *
 * VitaLink's infrastructure is torn down when nobody is using it, which is
 * deliberate — it runs on a five dollar monthly cap — and a portfolio link
 * to a service that is switched off shows nothing. So the four endpoints the
 * dashboard reads were called once against the real API, running against a
 * real PostgreSQL loaded from the simulator, and every response was recorded
 * verbatim in snapshot.json. Nothing here re-implements the API: this file
 * looks a path up in that recording and hands back what the server said.
 *
 * Two consequences worth stating plainly, because a demo that quietly lies
 * about what it is teaches the reader nothing:
 *
 * The data is synthetic. It always was — the patients come from a generator
 * seeded with 42, and no real clinical record has ever been near this
 * project.
 *
 * The recording is frozen, but the clock is not. A handover note reads "18
 * hours ago", and a board that says a reading is three months old is a board
 * nobody can judge. So every instant in the recording is moved forward by
 * the time elapsed since it was captured. The intervals between readings —
 * which is what the screens actually show — are untouched, and the text of
 * the summaries stays true to the rounds beneath it.
 */
import snapshot from './snapshot.json';

/** Set at build time: `VITE_DEMO=1 npm run build`. */
export const IS_DEMO = import.meta.env['VITE_DEMO'] === '1';

/** An instant, as the API writes them. Not a bare date: those must not move. */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

/**
 * Keys whose value is a timestamp that would be wrong if it moved.
 *
 * A date of birth is a fact about a person, not a point in this recording,
 * and the budget period is the calendar month the ledger was summed over.
 */
const FROZEN_KEYS = new Set(['birthDate', 'periodStart']);

/** When the recording was taken, as an ISO 8601 instant. */
export const CAPTURED_AT: string = (snapshot as Snapshot).capturedAt;

interface Snapshot {
  capturedAt: string;
  routes: Record<string, unknown>;
}

const routes = shiftTimes(
  (snapshot as Snapshot).routes,
  Date.now() - new Date(CAPTURED_AT).getTime(),
) as Record<string, unknown>;

/**
 * The recorded answer for a path, or a 404 for a path that was never called.
 *
 * The delay is not decoration. Every screen has a loading state and a race
 * to lose, and a store that answers synchronously would hide both — the demo
 * would exercise less of the code than the real thing does.
 */
export function demoGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const found = routes[path];

      if (found === undefined) {
        reject(new DemoMiss(path));
        return;
      }

      resolve(found as T);
    }, 140);

    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

/** A path the recording does not cover. Carries 404 so screens read it as one. */
export class DemoMiss extends Error {
  readonly status = 404;

  constructor(path: string) {
    super(`404 on ${path} — not part of the recorded snapshot`);
    this.name = 'DemoMiss';
  }
}

/** Every instant in `value`, moved forward by `deltaMs`. Pure; returns a copy. */
export function shiftTimes(value: unknown, deltaMs: number, key?: string): unknown {
  if (typeof value === 'string') {
    if (key !== undefined && FROZEN_KEYS.has(key)) {
      return value;
    }

    return INSTANT.test(value)
      ? new Date(new Date(value).getTime() + deltaMs).toISOString()
      : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => shiftTimes(item, deltaMs, key));
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [name, shiftTimes(item, deltaMs, name)]),
    );
  }

  return value;
}
