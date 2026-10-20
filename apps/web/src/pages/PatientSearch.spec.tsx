import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { patientSearchResult, resetFixtures } from '../fixtures';
import { mockApi, mockApiDown, renderRoute } from '../test-utils';
import { PatientSearch } from './PatientSearch';

/** The path the screen asks for, for a given search box content. */
function path(q: string): string {
  return `/api/patients/search?q=${encodeURIComponent(q)}&pageSize=25`;
}

function page(results: ReturnType<typeof patientSearchResult>[]) {
  return { data: results, page: 1, pageSize: 25, total: results.length, totalPages: 1 };
}

function render() {
  return renderRoute('/patients', '/patients', <PatientSearch />);
}

beforeEach(resetFixtures);
afterEach(() => vi.unstubAllGlobals());

describe('finding a patient', () => {
  it('lists everybody before anything is typed', async () => {
    mockApi({ [path('')]: page([patientSearchResult({ familyName: 'VÁZQUEZ' })]) });
    render();

    const table = await screen.findByRole('table');
    expect(within(table).getByText(/VÁZQUEZ/)).toBeInTheDocument();
  });

  it('waits for the typing to stop before asking', async () => {
    const api = mockApi({
      [path('')]: page([]),
      [path('vaz')]: page([patientSearchResult({ familyName: 'VÁZQUEZ' })]),
    });
    render();

    await screen.findByText(/No patients on record yet/i);

    const box = screen.getByRole('searchbox');
    // Three keystrokes in quick succession, which is what a person typing
    // does and what the debounce exists for.
    fireEvent.change(box, { target: { value: 'v' } });
    fireEvent.change(box, { target: { value: 'va' } });
    fireEvent.change(box, { target: { value: 'vaz' } });

    // One request per keystroke would be three more paths here. The debounce
    // is what keeps it to one, and the race it avoids is the answer for "va"
    // landing after the answer for "vaz".
    // Scoped to the table: the paragraph above it also says VÁZQUEZ, as the
    // example of what accent folding does, and matching that would make this
    // test pass before the request was ever made.
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    expect(within(screen.getByRole('table')).getByText(/VÁZQUEZ/)).toBeInTheDocument();

    expect(api.calls).toEqual([path(''), path('vaz')]);
  });

  it('trims what was typed before asking', async () => {
    const api = mockApi({
      [path('')]: page([]),
      [path('perea')]: page([patientSearchResult({ familyName: 'PEREA' })]),
    });
    render();

    await screen.findByText(/No patients on record yet/i);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '  perea  ' } });

    await waitFor(() => expect(screen.getByText(/PEREA/)).toBeInTheDocument());
    expect(api.calls).toContain(path('perea'));
  });

  it('says where an admitted patient is, and what they are scoring', async () => {
    mockApi({
      [path('')]: page([
        patientSearchResult({
          familyName: 'OCASIO',
          current: {
            admissionId: 'ADM-000007',
            ward: 'internal-medicine',
            admittedAt: '2026-09-20T10:00:00.000Z',
            awaitingCriticalCare: false,
            risk: 'high',
            aggregate: 10,
          },
        }),
      ]),
    });
    render();

    const row = (await screen.findByText(/OCASIO/)).closest('tr') as HTMLElement;

    expect(within(row).getByRole('link', { name: 'internal-medicine' })).toHaveAttribute(
      'href',
      '/admissions/ADM-000007',
    );
    expect(within(row).getByText('10')).toBeInTheDocument();
    expect(within(row).getByText('high')).toBeInTheDocument();
  });

  it('says a discharged patient is not in a bed rather than leaving it blank', async () => {
    mockApi({
      [path('')]: page([patientSearchResult({ familyName: 'PEREA', current: null, openAdmissions: 0 })]),
    });
    render();

    const row = (await screen.findByText(/PEREA/)).closest('tr') as HTMLElement;
    expect(within(row).getByText('not in a bed')).toBeInTheDocument();
  });

  it('distinguishes a patient nobody has measured from one scoring zero', async () => {
    mockApi({
      [path('')]: page([
        patientSearchResult({
          familyName: 'NUEVO',
          current: {
            admissionId: 'ADM-000099',
            ward: 'surgery',
            admittedAt: '2026-09-26T10:00:00.000Z',
            awaitingCriticalCare: false,
            risk: null,
            aggregate: null,
          },
        }),
      ]),
    });
    render();

    const row = (await screen.findByText(/NUEVO/)).closest('tr') as HTMLElement;
    expect(within(row).getByText('not measured')).toBeInTheDocument();
    expect(within(row).queryByText('0')).not.toBeInTheDocument();
  });

  it('flags a patient waiting for a critical care bed', async () => {
    mockApi({
      [path('')]: page([
        patientSearchResult({
          familyName: 'OCASIO',
          current: {
            admissionId: 'ADM-000007',
            ward: 'internal-medicine',
            admittedAt: '2026-09-20T10:00:00.000Z',
            awaitingCriticalCare: true,
            risk: 'high',
            aggregate: 10,
          },
        }),
      ]),
    });
    render();

    const row = (await screen.findByText(/OCASIO/)).closest('tr') as HTMLElement;
    expect(within(row).getByText('awaiting critical care')).toBeInTheDocument();
  });

  it('names what was searched for when nothing matches', async () => {
    mockApi({ [path('')]: page([patientSearchResult()]), [path('zzz')]: page([]) });
    render();

    await screen.findByRole('searchbox');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } });

    expect(await screen.findByText(/Nobody matches “zzz”/)).toBeInTheDocument();
  });

  it('says the search failed rather than showing an empty list', async () => {
    mockApiDown();
    render();

    expect(await screen.findByText(/did not answer/i)).toBeInTheDocument();
  });

  it('tells the reader the list is only the first page', async () => {
    mockApi({
      [path('')]: {
        data: [patientSearchResult({ familyName: 'ALFA' })],
        page: 1,
        pageSize: 25,
        total: 300,
        totalPages: 12,
      },
    });
    render();

    expect(await screen.findByText(/300 patients found, showing the first 1/)).toBeInTheDocument();
  });
});
