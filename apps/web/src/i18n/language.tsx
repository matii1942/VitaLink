/**
 * Which language the page is in, and how that is decided.
 *
 * The language lives in the URL, as `?lang=es`. Three reasons, in order of
 * how much they matter:
 *
 * A link carries it. Sending somebody the Spanish board means sending them a
 * link that opens in Spanish, without telling them to click anything.
 *
 * The back button works. The language is a piece of application state like
 * any other, and putting it anywhere else makes the browser's own history
 * disagree with what is on screen.
 *
 * It needs no storage. `localStorage` would remember the choice across
 * visits, which is a real convenience — and it comes back empty in a private
 * window, throws where site data is blocked, and is invisible to the person
 * sharing the link. The URL has none of those failure modes.
 *
 * The cost is that a first-time visitor's choice is not remembered between
 * visits. That is the trade, and it is the right way round for a page whose
 * main use is being opened from a link somebody sent.
 *
 * When the URL says nothing, the browser's own languages decide. Somebody
 * whose browser is set to Spanish should not have to find a switch.
 */
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import {
  Link,
  NavLink,
  useSearchParams,
  type LinkProps,
  type NavLinkProps,
} from 'react-router-dom';

import { CATALOGUE, LANGUAGES, LOCALES, type Language, type Strings } from './strings';

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  text: Strings;
}

/**
 * English, and a setter that does nothing.
 *
 * A component rendered outside the provider — which is every component in a
 * unit test — gets this instead of throwing. The screens are then testable on
 * their own, and a test that cares about the language wraps them itself.
 */
const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  setLanguage: () => {},
  text: CATALOGUE.en,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const language = read(params.get('lang'));

  // The document's own language attribute, which is what a screen reader
  // consults to choose a voice. Leaving it at English while the page is in
  // Spanish makes the page unreadable in exactly the way a translation was
  // supposed to fix.
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      text: CATALOGUE[language],
      setLanguage: (next) => {
        // replace, not push: changing the language is not a place somebody
        // navigated to, and leaving it in the history turns the back button
        // into an undo for a toggle.
        setParams(
          (current) => {
            const updated = new URLSearchParams(current);
            updated.set('lang', next);
            return updated;
          },
          { replace: true },
        );
      },
    }),
    [language, setParams],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/** Every string on screen, in the language that is showing. */
export function useText(): Strings {
  return useContext(LanguageContext).text;
}

/**
 * Links that do not lose the language, and why they have to exist.
 *
 * react-router's own `Link` replaces the whole URL, query string included. So
 * a plain `<Link to="/sync">` on a page opened as `/?lang=es` navigates to
 * `/sync` with no language on it — and the reader, who chose Spanish one
 * click ago, lands on an English page. A test caught this; the feature looked
 * finished without it, because every screen translated correctly and only
 * moving between them broke.
 *
 * The parameter is carried only when it is already there. A reader whose
 * browser asks for Spanish and who never touches the switch gets Spanish from
 * the fallback and keeps a clean URL; the parameter appears the moment
 * somebody states a preference, and from then on it travels.
 *
 * These read the URL directly rather than the provider, so they work in a
 * page's own test — a router with no provider above it — exactly as they do
 * in the application.
 */
export function LangLink({ to, ...rest }: LinkProps & { to: string }) {
  return <Link to={useLangHref(to)} {...rest} />;
}

export function LangNavLink({ to, ...rest }: NavLinkProps & { to: string }) {
  return <NavLink to={useLangHref(to)} {...rest} />;
}

/** `/sync` → `/sync?lang=es`, when and only when the URL already says so. */
function useLangHref(to: string): string {
  const [params] = useSearchParams();
  const stated = params.get('lang');

  if (!isLanguage(stated)) {
    return to;
  }

  const [path, existing] = to.split('?');
  const merged = new URLSearchParams(existing);
  merged.set('lang', stated);

  return `${path}?${merged.toString()}`;
}

/** The current language and the switch, for the one component that needs both. */
export function useLanguage(): Omit<LanguageContextValue, 'text'> {
  const { language, setLanguage } = useContext(LanguageContext);
  return { language, setLanguage };
}

/** The locale tag to format a date or a number with, for `toLocaleString`. */
export function useLocale(): string {
  return LOCALES[useContext(LanguageContext).language];
}

/**
 * What the URL says, or what the browser prefers, or English.
 *
 * `navigator.languages` is the ordered list of what the reader asked for, so
 * a browser set to French then Spanish gets Spanish rather than English. The
 * tags carry a region — `es-AR` — and only the part before the dash is ours
 * to match.
 */
export function read(fromUrl: string | null): Language {
  if (isLanguage(fromUrl)) {
    return fromUrl;
  }

  // In a server-rendered or test environment there may be no navigator.
  const preferred = typeof navigator === 'undefined' ? [] : (navigator.languages ?? []);

  for (const tag of preferred) {
    const base = tag.split('-')[0];

    if (isLanguage(base)) {
      return base;
    }
  }

  return 'en';
}

function isLanguage(value: string | null | undefined): value is Language {
  return value !== null && value !== undefined && (LANGUAGES as readonly string[]).includes(value);
}
