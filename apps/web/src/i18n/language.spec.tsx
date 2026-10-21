/**
 * How the language gets decided, tested without rendering a screen.
 *
 * `read` is the whole decision in one pure function, which is why it is
 * exported: the alternative is asserting on a rendered page to find out what
 * a browser setting would have done.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { read } from './language';
import { CATALOGUE, LANGUAGES } from './strings';

afterEach(() => vi.unstubAllGlobals());

function browserAsksFor(...languages: string[]): void {
  vi.stubGlobal('navigator', { languages });
}

describe('read', () => {
  it('takes the language from the URL when it says one', () => {
    browserAsksFor('es-AR');
    expect(read('en')).toBe('en');
  });

  it('falls back to what the browser asks for', () => {
    browserAsksFor('es-AR', 'en-GB');
    expect(read(null)).toBe('es');
  });

  // The tags carry a region and only the part before the dash is ours to
  // match — a reader on es-MX gets Spanish, not English.
  it('ignores the region in the tag', () => {
    browserAsksFor('es-MX');
    expect(read(null)).toBe('es');
  });

  it('takes the first language it knows, in the order asked for', () => {
    browserAsksFor('fr-FR', 'es-AR', 'en-GB');
    expect(read(null)).toBe('es');
  });

  it('falls back to English for a language it does not have', () => {
    browserAsksFor('fr-FR', 'de-DE');
    expect(read(null)).toBe('en');
  });

  // A URL is something anybody can type, so `?lang=klingon` has to be a
  // non-event rather than a blank page.
  it('ignores a language the catalogue does not have', () => {
    browserAsksFor('en-GB');
    expect(read('klingon')).toBe('en');
  });

  it('survives an environment with no navigator at all', () => {
    vi.stubGlobal('navigator', undefined);
    expect(read(null)).toBe('en');
  });
});

/**
 * The catalogue's shape is checked by the compiler — `Record<Language,
 * Strings>` makes a missing key a build error, which is the whole reason the
 * file is typed. What the compiler cannot check is a key that was filled in
 * by copying the English and forgetting to translate it, so this walks both
 * catalogues and compares.
 */
describe('the catalogue', () => {
  it('has an entry for every language', () => {
    for (const code of LANGUAGES) {
      expect(CATALOGUE[code]).toBeDefined();
    }
  });

  it('does not leave a Spanish string sitting at its English value', () => {
    const untranslated: string[] = [];

    walk(CATALOGUE.en, CATALOGUE.es, '', (path, en, es) => {
      if (en === es && !DELIBERATELY_IDENTICAL.has(path)) {
        untranslated.push(`${path}: ${en}`);
      }
    });

    expect(untranslated).toEqual([]);
  });

  // The allow-list is the rule from the top of strings.tsx, written out as
  // data: a Spanish string identical to its English one is a bug unless it is
  // on this list. Adding a path here is a decision somebody has to defend;
  // leaving one off is a test failure rather than a blank-looking screen.
  it('keeps the allow-list honest by only listing keys that exist', () => {
    const paths: string[] = [];
    walk(CATALOGUE.en, CATALOGUE.es, '', (path) => paths.push(path));

    for (const allowed of DELIBERATELY_IDENTICAL) {
      expect(paths).toContain(allowed);
    }
  });
});

/**
 * The strings that are the same in both languages on purpose.
 *
 * NEWS2 is a Royal College of Physicians standard and its vocabulary is used
 * untranslated in Spanish-speaking hospitals; `Resp`, `SpO2`, `Temp` and
 * `Glasgow` are the abbreviations a chart already carries; `M`, `F` and `?`
 * are initials that happen to coincide.
 */
const DELIBERATELY_IDENTICAL = new Set([
  'board.columns.news2',
  'board.redScore',
  'patient.columns.news2',
  'patient.columns.resp',
  'patient.columns.spo2',
  'patient.columns.temp',
  'patient.columns.glasgow',
  'search.columns.news2',
  'sex.male',
  'sex.female',
  'sex.unknown',
]);

/**
 * Walks two objects of the same shape, calling back on each pair of strings.
 *
 * Two kinds of leaf are skipped, both because reading them proves nothing. A
 * function builds a phrase around a value, so it has no text until it is
 * called — format.spec.ts and the screens cover those. A React element is a
 * tree of props, and walking into it compares tag names and nested fragments
 * rather than prose; the first version of this test did exactly that and
 * reported `type: strong` as an untranslated string.
 */
function walk(
  en: unknown,
  es: unknown,
  path: string,
  found: (path: string, en: string, es: string) => void,
): void {
  if (typeof en === 'string' && typeof es === 'string') {
    found(path, en, es);
    return;
  }

  if (!isPlainObject(en) || !isPlainObject(es)) {
    return;
  }

  for (const key of Object.keys(en)) {
    walk(en[key], es[key], path === '' ? key : `${path}.${key}`, found);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  // `$$typeof` is React's own marker on an element, and the only reliable way
  // to tell one from a section of the catalogue.
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !('$$typeof' in value)
  );
}
