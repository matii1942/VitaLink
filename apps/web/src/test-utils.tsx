/**
 * What a component test needs, and nothing more.
 *
 * Two helpers. One puts a component under a route, because most of these
 * screens read the URL and a component rendered outside a router has no URL
 * to read. The other replaces `fetch` with a table of canned answers.
 *
 * The API is stubbed at `fetch` rather than by injecting a fake client. That
 * is deliberate: stubbing at the boundary the browser actually has means the
 * test exercises the real request path — the URL that gets built, the status
 * handling, the abort on unmount — instead of a seam invented to make testing
 * easy. A seam invented for tests is a seam only the tests use.
 */
import { render, type RenderResult } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';

/** Renders `element` as if the browser were at `at`, matching `pattern`. */
export function renderRoute(pattern: string, at: string, element: ReactNode): RenderResult {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path={pattern} element={element} />
      </Routes>
    </MemoryRouter>,
  );
}

export interface ApiStub {
  /** Every path requested, in order. Assert on this to prove a cache works. */
  readonly calls: string[];
}

/**
 * Answers the paths in `routes` with their JSON, and everything else with a
 * 404 — so a test that mistypes a path fails loudly instead of hanging.
 */
export function mockApi(routes: Record<string, unknown>): ApiStub {
  const calls: string[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      calls.push(path);

      if (!(path in routes)) {
        return Promise.resolve(new Response('no such route', { status: 404 }));
      }

      return Promise.resolve(
        new Response(JSON.stringify(routes[path]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }),
  );

  return { calls };
}

/** Answers every path with a failure, for the error-state tests. */
export function mockApiDown(status = 500): void {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('down', { status }))));
}
