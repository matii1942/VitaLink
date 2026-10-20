import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetFixtures, wardRisk, wardSummary } from '../fixtures';
import { mockApi, mockApiDown, renderRoute } from '../test-utils';
import { WardList } from './WardList';

function render() {
  return renderRoute('/', '/', <WardList />);
}

beforeEach(resetFixtures);
afterEach(() => vi.unstubAllGlobals());

describe('the first screen', () => {
  it('says what the system does before it shows a number', async () => {
    mockApi({ '/api/wards': [wardSummary()] });
    render();

    // A reader who does not know what NEWS2 is has to be told on this screen
    // or not at all. If this ever fails, the explanation was deleted.
    expect(await screen.findByText(/early warning score/i)).toBeInTheDocument();
  });

  it('adds the wards up into the headline numbers', async () => {
    mockApi({
      '/api/wards': [
        wardSummary({ ward: 'cardiology', risk: wardRisk({ high: 1, low: 2 }) }),
        wardSummary({ ward: 'surgery', risk: wardRisk({ medium: 1, low: 3 }) }),
      ],
    });
    render();

    const inBeds = await screen.findByText('patients in a bed');
    expect(within(inBeds.closest('.tile') as HTMLElement).getByText('7')).toBeInTheDocument();

    // high + medium + low-medium, across every ward.
    const attention = screen.getByText('need attention now');
    expect(within(attention.closest('.tile') as HTMLElement).getByText('2')).toBeInTheDocument();
  });

  it('counts the patients waiting for an intensive care bed across every ward', async () => {
    mockApi({
      '/api/wards': [
        wardSummary({ ward: 'cardiology', risk: wardRisk({ high: 1, awaitingCriticalCare: 1 }) }),
        wardSummary({ ward: 'surgery', risk: wardRisk({ high: 1, awaitingCriticalCare: 1 }) }),
      ],
    });
    render();

    const waiting = await screen.findByText(/waiting for an intensive care bed/i);
    expect(within(waiting.closest('.tile') as HTMLElement).getByText('2')).toBeInTheDocument();
  });

  it('writes every band out in words beside the bar', async () => {
    mockApi({
      '/api/wards': [
        wardSummary({ ward: 'internal-medicine', risk: wardRisk({ high: 1, lowMedium: 1, low: 7 }) }),
      ],
    });
    render();

    const card = (await screen.findByText('internal-medicine')).closest('.card') as HTMLElement;

    // The bar is decoration; these three are the actual information.
    expect(within(card).getByText('1 high')).toBeInTheDocument();
    expect(within(card).getByText('1 low-medium')).toBeInTheDocument();
    expect(within(card).getByText('7 low')).toBeInTheDocument();
  });

  it('does not write out a band nobody is in', async () => {
    mockApi({ '/api/wards': [wardSummary({ risk: wardRisk({ low: 3 }) })] });
    render();

    expect(await screen.findByText('3 low')).toBeInTheDocument();
    expect(screen.queryByText(/^0 /)).not.toBeInTheDocument();
  });

  it('explains every band, including the one that is easy to misread', async () => {
    mockApi({ '/api/wards': [wardSummary()] });
    render();

    const legend = (await screen.findByText('What the bands mean')).closest(
      'section',
    ) as HTMLElement;

    // low-medium is the band a stranger will misread as "nearly fine", and it
    // is the one the red-score rule exists for.
    expect(within(legend).getByText(/looks stable and is not/i)).toBeInTheDocument();
    expect(within(legend).getByText(/absence of measurement/i)).toBeInTheDocument();
  });

  it('links each ward to its board', async () => {
    mockApi({ '/api/wards': [wardSummary({ ward: 'internal-medicine' })] });
    render();

    const link = await screen.findByRole('link', { name: /internal-medicine/ });
    expect(link).toHaveAttribute('href', '/wards/internal-medicine');
  });

  it('says the API did not answer rather than showing an empty page', async () => {
    mockApiDown();
    render();

    expect(await screen.findByText(/did not answer/i)).toBeInTheDocument();
  });

  it('tells a reader with no wards what to do about it', async () => {
    mockApi({ '/api/wards': [] });
    render();

    expect(await screen.findByText(/run a synchronisation first/i)).toBeInTheDocument();
  });

  it('asks the server for the breakdown instead of fetching every board', async () => {
    const api = mockApi({
      '/api/wards': [wardSummary({ ward: 'a' }), wardSummary({ ward: 'b' })],
    });
    render();

    await screen.findByText('a');

    // One request, whatever the number of wards. Adding the boards up in the
    // browser would be the N+1 problem in a project that has an ADR about it.
    expect(api.calls).toEqual(['/api/wards']);
  });
});
