import { describe, expect, it } from 'vitest';

import { riskLabel, sexInitial, timeAgo } from './format';
import { CATALOGUE } from './i18n/strings';

const en = CATALOGUE.en;
const es = CATALOGUE.es;

const now = new Date('2026-09-27T12:00:00.000Z');

describe('timeAgo', () => {
  it('counts minutes under an hour', () => {
    expect(timeAgo('2026-09-27T11:38:00.000Z', en.time, now)).toBe('22 min ago');
  });

  it('counts hours up to two days', () => {
    expect(timeAgo('2026-09-27T08:00:00.000Z', en.time, now)).toBe('4 h ago');
  });

  it('counts days beyond that', () => {
    expect(timeAgo('2026-09-24T12:00:00.000Z', en.time, now)).toBe('3 d ago');
  });

  it('says just now for an observation taken this minute', () => {
    expect(timeAgo('2026-09-27T11:59:40.000Z', en.time, now)).toBe('just now');
  });

  // Spanish puts the preposition first — "hace 22 min", not "22 min hace" —
  // which is exactly why the catalogue holds whole phrases built by a function
  // and not a word to glue onto a number.
  it('builds the phrase in the order the language uses', () => {
    expect(timeAgo('2026-09-27T11:38:00.000Z', es.time, now)).toBe('hace 22 min');
    expect(timeAgo('2026-09-27T08:00:00.000Z', es.time, now)).toBe('hace 4 h');
    expect(timeAgo('2026-09-27T11:59:40.000Z', es.time, now)).toBe('recién');
  });
});

describe('riskLabel', () => {
  it('spells the band out', () => {
    expect(riskLabel('low-medium', 'scored', en.common)).toBe('low-medium');
  });

  it('says a patient was deliberately not scored', () => {
    // Under sixteen: NEWS2 does not apply, and "no score" would read as an
    // omission rather than a decision (ADR 0005).
    expect(riskLabel(null, 'not-eligible', en.common)).toBe('not scored');
  });

  it('says there is no score when the scorer has not reached the observation', () => {
    expect(riskLabel(null, undefined, en.common)).toBe('no score');
  });

  // The rule from the top of i18n/strings.tsx, asserted rather than trusted:
  // the four NEWS2 bands are a Royal College of Physicians standard and stay
  // in English in both languages, while the two labels this project invented
  // are translated. If somebody ever adds `bajo-medio` to the catalogue, this
  // is the test that stops it.
  it('leaves the NEWS2 bands in English and translates only our own labels', () => {
    expect(riskLabel('low-medium', 'scored', es.common)).toBe('low-medium');
    expect(riskLabel('high', 'scored', es.common)).toBe('high');
    expect(riskLabel(null, 'not-eligible', es.common)).toBe('sin puntuar');
    expect(riskLabel(null, undefined, es.common)).toBe('sin puntuación');
  });
});

describe('sexInitial', () => {
  it('abbreviates the recorded values', () => {
    expect(sexInitial('female', en.sex)).toBe('F');
    expect(sexInitial('male', en.sex)).toBe('M');
  });

  it('does not invent one it was not given', () => {
    expect(sexInitial('unknown', en.sex)).toBe('?');
  });

  // Femenino and masculino happen to start with the same letters, so the
  // Spanish initials are the English ones. Asserted because it is a
  // coincidence, not a rule: a third language would break it.
  it('keeps the same initials in Spanish', () => {
    expect(sexInitial('female', es.sex)).toBe('F');
    expect(sexInitial('male', es.sex)).toBe('M');
  });
});
