/**
 * The masthead and the language switch.
 *
 * These tests render the whole application rather than one screen, because
 * what is being tested only exists when the pieces are assembled: the
 * provider reads the URL, the switch writes it, and the screens read the
 * provider. A test of any one of the three in isolation would pass with the
 * wiring missing — which is exactly the state this file was written to catch.
 */
import { render, screen, within } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';
import { resetFixtures, wardSummary } from './fixtures';
import { LanguageProvider } from './i18n/language';
import { mockApi } from './test-utils';

function renderApp(at = '/') {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </MemoryRouter>,
  );
}

function masthead(): HTMLElement {
  return screen.getByRole('banner');
}

function switchTo(name: string): void {
  fireEvent.click(within(masthead()).getByRole('button', { name }));
}

beforeEach(() => {
  resetFixtures();
  mockApi({ '/api/wards': [wardSummary()] });

  // The browser's own preference is the fallback, so a test that did not pin
  // it would pass or fail depending on the machine running it.
  vi.stubGlobal('navigator', { languages: ['en-GB'] });
  document.documentElement.lang = '';
});

afterEach(() => vi.unstubAllGlobals());

describe('the language switch', () => {
  it('starts in English for a reader whose browser asks for English', async () => {
    renderApp();

    expect(await screen.findByRole('link', { name: 'Wards' })).toBeInTheDocument();
    expect(within(masthead()).getByRole('button', { name: 'English' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('opens in Spanish for a reader whose browser asks for Spanish', async () => {
    vi.stubGlobal('navigator', { languages: ['es-AR', 'en-GB'] });
    renderApp();

    expect(await screen.findByRole('link', { name: 'Salas' })).toBeInTheDocument();
  });

  // The point of putting the language in the URL: a link opens in the
  // language it was sent in, with nothing to click.
  it('opens in the language the URL asks for, whatever the browser prefers', async () => {
    renderApp('/?lang=es');

    expect(await screen.findByRole('link', { name: 'Salas' })).toBeInTheDocument();
    expect(within(masthead()).getByRole('button', { name: 'Español' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('translates the screen, not only the navigation', async () => {
    renderApp();
    await screen.findByRole('link', { name: 'Wards' });

    switchTo('Español');

    // The lede on the first screen, which is the longest piece of prose on
    // the site and the one a stranger actually reads.
    expect(await screen.findByText(/puntaje nacional de alerta temprana/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Salas' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Wards' })).not.toBeInTheDocument();
  });

  it('puts the choice in the URL so the page can be shared in that language', async () => {
    renderApp();
    await screen.findByRole('link', { name: 'Wards' });

    switchTo('Español');

    expect(await screen.findByRole('link', { name: 'Salas' })).toBeInTheDocument();
    // jsdom's location is the MemoryRouter's, which does not touch
    // window.location — so the proof that the language travels in the URL is
    // the link the router rendered for the current route.
    expect(screen.getByRole('link', { name: 'Salas' })).toHaveAttribute('href', '/?lang=es');
  });

  /*
   * The attribute a screen reader consults to choose a voice. A Spanish page
   * left marked as English is read aloud by an English voice, which is a
   * harder failure than no translation at all: the words are right and
   * unintelligible.
   */
  it('tells the document which language it is in', async () => {
    renderApp();
    await screen.findByRole('link', { name: 'Wards' });
    expect(document.documentElement.lang).toBe('en');

    switchTo('Español');

    expect(await screen.findByRole('link', { name: 'Salas' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('es');
  });

  it('marks each option in its own language so it is pronounced correctly', async () => {
    renderApp();
    await screen.findByRole('link', { name: 'Wards' });

    expect(within(masthead()).getByRole('button', { name: 'Español' })).toHaveAttribute(
      'lang',
      'es',
    );
    expect(within(masthead()).getByRole('button', { name: 'English' })).toHaveAttribute(
      'lang',
      'en',
    );
  });

  it('can be switched back', async () => {
    renderApp('/?lang=es');
    await screen.findByRole('link', { name: 'Salas' });

    switchTo('English');

    expect(await screen.findByRole('link', { name: 'Wards' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
  });
});

describe('a route that does not exist', () => {
  it('says so in the language showing', async () => {
    renderApp('/nothing-here?lang=es');
    expect(await screen.findByText('No existe esa página.')).toBeInTheDocument();
  });
});
