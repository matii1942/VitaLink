# ADR 0017 — The dashboard is bilingual, except where it must not be

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

The repository is in English by standing agreement (`CLAUDE.md`) and the
simulated hospital's data is in Spanish, because that is what an Argentinian
hospital's system would emit. The interface sat on the English side of that
line, which made it the one part of the project a Spanish-speaking nurse could
not read — and the people this dashboard is for are Spanish-speaking nurses.

Translating a clinical interface is not the same problem as translating a
marketing page. Three things on these screens look like text and are not:

1. **NEWS2's own vocabulary.** `low`, `low-medium`, `medium`, `high` and
   `red score` are a Royal College of Physicians standard. Spanish-speaking
   hospitals use them untranslated, the way they use *shock* and *sepsis*.
2. **The data.** Diagnoses arrive in Spanish and ward codes in English, both
   from the source system.
3. **Two sentences the API sends on purpose.** The board's ordering rule and
   the summary's disclaimer are sent precisely so that a consumer does not
   restate them and risk describing something the query does not do.

## Decision

### The rule

> Standard NEWS2 vocabulary stays in English. The project's own labels are
> translated. The data is never translated.

So `low-medium` stays `low-medium` in both languages — rendering it as
"bajo-medio" would invent vocabulary nobody says at a handover, and a nurse
who knows NEWS2 would have to translate it back. `not scored` and `no score`
are our wording, so they are translated, and they are translated as two
different phrases because they mean two different things (ADR 0005): a
deliberate decision not to score, and a measurement nobody has taken yet.

A test enforces this. `i18n/language.spec.tsx` walks both catalogues and fails
on any Spanish string identical to its English one unless its path is on an
allow-list that names why.

### No internationalisation library

Four screens and two languages is a dictionary and a React context. A library
would be a dependency to install, a build step to configure and a vocabulary
to learn, in exchange for plural rules for Russian, lazy-loaded locales and
message compilation — none of which this uses. The line to watch is the third
language or the first plural rule the catalogue cannot express by hand.

The catalogue is typed: `Record<Language, Strings>` against an interface, so a
missing translation is a compile error rather than a blank space somebody
finds in production.

### The language lives in the URL

`?lang=es`, read with `useSearchParams`. A link then carries it, so sending
somebody the Spanish board is sending them a link. The back button keeps
working, because the language is application state like any other. And it
needs no storage: `localStorage` would remember the choice between visits, and
it comes back empty in a private window, throws where site data is blocked,
and is invisible to the person sharing the link.

The cost is that a first-time visitor's choice is not remembered between
visits. That is the trade, and it is the right way round for a page whose main
use is being opened from a link somebody sent. When the URL says nothing, the
browser's own `navigator.languages` decides, so a reader whose browser is set
to Spanish never has to find the switch.

Because the language is in the query string, `Link` had to be wrapped:
react-router's own replaces the whole URL, query string included, so a plain
`<Link to="/sync">` on `/?lang=es` lands on an English page. `LangLink` and
`LangNavLink` carry the parameter when it is already there. A test caught
this; the feature looked finished without it, because every screen translated
correctly and only moving between them broke.

### What stays in English, and says so

Three things render in English on a Spanish page, each marked `lang="en"` so
that a screen reader chooses an English voice for them. An English sentence
read aloud with Spanish phonetics is worse than an untranslated one: the words
are right and unintelligible.

- the board's ordering rule, from the API;
- the summary's disclaimer, from the API;
- **the handover note itself**, which is the uncomfortable one.

## The limitation worth naming

The handover note is the longest and most important paragraph on the patient
screen, and it arrives in English whatever language the page is in, because it
is generated on the server from an English prompt.

Translating it in the browser is not an option. It would mean a second model
pass over clinical text, with a second chance to change what it says — and the
verifier that rejects any figure absent from the record (ADR 0012) runs on the
server, against the English text, before the note is ever stored. A browser-side
translation would be unverified text wearing a verified note's clothes.

The right fix is on the API: `Accept-Language` on `/summary`, a prompt per
language, the verifier run against each, and the cache keyed by language as
well as by observation (ADR 0013). That is a sprint, not an afternoon, and it
is not done. Until it is, the note is marked as the English it is.

## Consequences

- Every string on screen is in one file, which is also the file to read to
  find out what this interface actually says.
- Adding a third language means filling in one more `Strings` value and
  nothing else; the compiler lists what is missing.
- Dates and numbers follow the language, not the browser (`es-AR`, `en-GB`),
  because a page translated into Spanish with English month names is a page
  that did not finish.
- The demo is a hash-routed static build, so a shared Spanish link reads
  `…/#/wards/cardiology?lang=es`. The parameter is inside the hash; that is
  what `useSearchParams` reads under `HashRouter` (ADR 0016).
- The handover note, the ordering rule and the disclaimer remain English until
  the API change above is done.
