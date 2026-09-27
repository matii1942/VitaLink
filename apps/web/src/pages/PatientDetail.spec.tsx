/**
 * The patient detail, with the summary card carrying most of the weight.
 *
 * Every test here is about the same question in a different disguise: can a
 * reader tell where this paragraph came from and how old it is? That is the
 * promise ADR 0012 makes, and it is a promise the interface keeps or breaks
 * — the API can label a summary perfectly and the screen can still show the
 * text and swallow the label.
 */
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { admission, observation, resetFixtures, score, summary } from '../fixtures';
import { mockApi, renderRoute } from '../test-utils';
import { PatientDetail } from './PatientDetail';

const ID = 'ADM-0001';
const ADMISSION = `/api/admissions/${ID}`;
const OBSERVATIONS = `/api/admissions/${ID}/observations?order=desc&pageSize=40`;
const SUMMARY = `/api/admissions/${ID}/summary`;

function show() {
  return renderRoute('/admissions/:admissionId', `/admissions/${ID}`, <PatientDetail />);
}

function page(over: { admission?: unknown; rounds?: unknown[]; summary?: unknown } = {}) {
  const rounds = over.rounds ?? [observation(), observation()];

  return {
    [ADMISSION]: over.admission ?? admission({ admissionId: ID }),
    [OBSERVATIONS]: {
      data: rounds,
      page: 1,
      pageSize: 40,
      total: rounds.length,
      totalPages: 1,
    },
    [SUMMARY]: over.summary ?? summary(),
  };
}

beforeEach(() => {
  resetFixtures();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PatientDetail', () => {
  it('shows the summary and says it is current', async () => {
    mockApi(page());

    show();

    expect(await screen.findByText('The patient is stable on room air.')).toBeInTheDocument();
    expect(screen.getByText('current')).toBeInTheDocument();
  });

  it('always states that the text is derived, not a clinical record', async () => {
    mockApi(page());

    show();

    // Not conditional, not behind a tooltip, not only when stale. A reader
    // who cannot tell a machine wrote this will quote it as a finding.
    expect(await screen.findByText(/Derived text, not a clinical record/)).toBeInTheDocument();
  });

  it('shows a stale summary together with the reason it was not refreshed', async () => {
    mockApi(
      page({
        summary: summary({
          state: 'stale',
          reason: 'The monthly budget of 5 dollars is spent.',
          text: 'Respiration rate has risen across the last two rounds.',
        }),
      }),
    );

    show();

    // Both halves. The old text alone is a lie by omission; the reason alone
    // throws away a paragraph that is still useful.
    expect(
      await screen.findByText('Respiration rate has risen across the last two rounds.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/budget of 5 dollars is spent/)).toBeInTheDocument();
    expect(screen.getByText('stale')).toBeInTheDocument();
  });

  it('shows no text at all when no model is configured', async () => {
    mockApi(
      page({
        summary: summary({
          state: 'unavailable',
          text: null,
          reason: 'No model is configured.',
          generatedAt: null,
          throughRecordedAt: null,
        }),
      }),
    );

    show();

    expect(await screen.findByText('No model is configured.')).toBeInTheDocument();
    expect(screen.getByText('unavailable')).toBeInTheDocument();
  });

  it('names the round the summary covers, not the moment it was written', async () => {
    mockApi(page());

    show();

    expect(await screen.findByText(/Covers observations up to/)).toBeInTheDocument();
    expect(screen.getByText(/3 rounds read/)).toBeInTheDocument();
  });

  it('gives a pending critical care bed the weight it has on the board', async () => {
    mockApi(
      page({
        admission: admission({
          admissionId: ID,
          awaitingCriticalCare: true,
          criticalCareRequest: { unit: 'intensive-care', requestedAt: '2026-09-27T06:00:00.000Z' },
        }),
      }),
    );

    show();

    expect(await screen.findByText(/awaiting intensive-care/)).toBeInTheDocument();
  });

  it('prints a dash for a measurement nobody took', async () => {
    mockApi(page({ rounds: [observation({ systolicBP: null }), observation()] }));

    show();

    // An empty cell reads as zero, or as a rendering bug. A dash is a
    // statement: this was not measured.
    const cells = await screen.findAllByText('—');
    expect(cells.length).toBeGreaterThan(0);
  });

  it('says a round was not scored rather than showing nothing', async () => {
    mockApi({
      ...page({ rounds: [observation({ score: null }), observation()] }),
    });

    show();

    expect(await screen.findByText('no score')).toBeInTheDocument();
  });

  it('does not score a patient who is not eligible for NEWS2', async () => {
    mockApi(
      page({
        rounds: [
          observation({
            score: score({ status: 'not-eligible', notEligibleReason: 'under-16', aggregate: null, risk: null }),
          }),
          observation(),
        ],
      }),
    );

    show();

    expect(await screen.findByText('not scored')).toBeInTheDocument();
  });
});
