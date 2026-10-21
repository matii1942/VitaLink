/**
 * The layout and the routing table.
 *
 * A route maps a URL to a component. That mapping is what makes the back
 * button, a bookmark and a shared link work in an application that never
 * reloads the page — the URL stays the source of truth for what is on
 * screen, instead of a variable in memory that only this tab knows about.
 *
 * The language is in the URL for the same reason. See i18n/language.tsx.
 */
import { Route, Routes } from 'react-router-dom';

import { CAPTURED_AT, IS_DEMO } from './demo/demo';
import { LangLink, LangNavLink, useLanguage, useLocale, useText } from './i18n/language';
import { LANGUAGE_NAMES, LANGUAGES } from './i18n/strings';
import { PatientDetail } from './pages/PatientDetail';
import { PatientSearch } from './pages/PatientSearch';
import { SyncRuns } from './pages/SyncRuns';
import { WardBoard } from './pages/WardBoard';
import { WardList } from './pages/WardList';

/**
 * The date the responses were recorded, spelled the way each language spells
 * a date — so Spanish gets "27 de septiembre de 2026" rather than an English
 * month name with Spanish words around it. The locale tags live in
 * i18n/strings.tsx, with the note on why they carry a region.
 *
 * UTC (Coordinated Universal Time) is forced so that the date does not shift
 * by one depending on where the reader is sitting — the recording has one
 * date, and it is not the reader's business what time zone it was made in.
 */
function capturedOn(locale: string): string {
  return new Date(CAPTURED_AT).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * What this page is, said once, at the top, before anybody reads a number
 * off it. A demonstration that does not admit to being one is a lie with a
 * chart on it.
 */
function DemoNotice() {
  const text = useText();
  const locale = useLocale();

  return <p className="demo-notice">{text.app.demoNotice(capturedOn(locale))}</p>;
}

/**
 * The language switch.
 *
 * Buttons rather than links, because the provider's setter copies the rest of
 * the query string instead of replacing it — a hard-coded `?lang=es` href
 * would silently drop any other parameter a future screen puts there.
 *
 * Each option is written in its own language and carries `lang` to say so, so
 * that a screen reader pronounces "Español" in Spanish instead of reading it
 * as an English word. `aria-pressed` is what tells it which one is showing;
 * the underline is only the sighted half of that same information.
 */
function LanguageSwitch() {
  const text = useText();
  const { language, setLanguage } = useLanguage();

  return (
    <div className="language-switch" role="group" aria-label={text.nav.language}>
      {LANGUAGES.map((code) => (
        <button
          key={code}
          type="button"
          lang={code}
          aria-pressed={code === language}
          onClick={() => setLanguage(code)}
        >
          {LANGUAGE_NAMES[code]}
        </button>
      ))}
    </div>
  );
}

export function App() {
  const text = useText();

  return (
    <div className="layout">
      <header className="masthead">
        <h1>
          <LangLink to="/" style={{ textDecoration: 'none' }}>
            VitaLink
          </LangLink>
        </h1>
        <p>{text.masthead.subtitle}</p>
        {/*
          Two destinations, so the navigation is a pair of links rather than a
          component. A third one is the moment to reach for something more.
        */}
        <nav className="masthead-nav">
          <LangNavLink to="/" end>
            {text.nav.wards}
          </LangNavLink>
          <LangNavLink to="/patients">{text.nav.patients}</LangNavLink>
          <LangNavLink to="/sync">{text.nav.sync}</LangNavLink>
        </nav>
        <LanguageSwitch />
      </header>

      {IS_DEMO && <DemoNotice />}

      <Routes>
        <Route path="/" element={<WardList />} />
        <Route path="/patients" element={<PatientSearch />} />
        <Route path="/sync" element={<SyncRuns />} />
        <Route path="/wards/:ward" element={<WardBoard />} />
        <Route path="/admissions/:admissionId" element={<PatientDetail />} />
        <Route path="*" element={<p className="state">{text.app.noSuchPage}</p>} />
      </Routes>
    </div>
  );
}
