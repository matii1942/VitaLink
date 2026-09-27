/**
 * One function that talks to the API, and one hook that uses it.
 *
 * No data-fetching library. For three screens reading four endpoints, a
 * library would be more code to explain than the forty lines below, and this
 * project has already paid for the habit of adding a dependency before
 * measuring whether it earns its place.
 */
import { useEffect, useState } from 'react';

import { demoGet, DemoMiss, IS_DEMO } from './demo/demo';

/**
 * Empty in development: requests go to /api, which the dev server forwards
 * to the API (see vite.config.ts). Set VITE_API_URL to point a built site at
 * a deployed one.
 */
const BASE = (import.meta.env['VITE_API_URL'] as string | undefined) ?? '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  // The demo build has no server to talk to. The substitution is here, at the
  // single place a request leaves the application, so that everything above —
  // the hook, the cancellation, the loading and error states, every screen —
  // is the same code in both builds.
  if (IS_DEMO) {
    try {
      return await demoGet<T>(path, signal);
    } catch (error: unknown) {
      if (error instanceof DemoMiss) {
        throw new ApiError(error.message, error.status);
      }

      throw error;
    }
  }

  const response = await fetch(`${BASE}${path}`, {
    headers: { accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    // 404 has to be distinguishable from "the network is down": a ward that
    // does not exist is a different screen from an API that is unreachable.
    throw new ApiError(`${response.status} on ${path}`, response.status);
  }

  return (await response.json()) as T;
}

/** What a screen knows about a request while it is in flight. */
export interface Resource<T> {
  data: T | null;
  loading: boolean;
  error: ApiError | Error | null;
}

/**
 * Fetches `path` and re-fetches whenever it changes.
 *
 * Two details that are easy to get wrong and unpleasant to debug:
 *
 * The AbortController. When the path changes — the nurse clicks another ward
 * — the previous request is cancelled. Without it, two requests are in the
 * air and the slower one may land last, painting the screen with the ward
 * that was left. The cleanup function returned below is what React calls
 * before running the effect again.
 *
 * The AbortError is swallowed. A cancelled request is not a failure; it is
 * this code having changed its mind, and showing the user an error for it
 * would be reporting our own decision back to them as a problem.
 */
export function useResource<T>(path: string): Resource<T> {
  const [state, setState] = useState<Resource<T>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();

    setState({ data: null, loading: true, error: null });

    get<T>(path, controller.signal)
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        setState({
          data: null,
          loading: false,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      });

    return () => controller.abort();
  }, [path]);

  return state;
}
