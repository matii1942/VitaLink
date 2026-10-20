/**
 * The way in.
 *
 * This is the first screen, and for most of the people who open the published
 * demo it is also the only one they will read carefully. They are not nurses.
 * They do not know what NEWS2 is, that a score of 7 means something different
 * from a score of 5, or why a patient with a total of 4 might still need
 * someone at the bedside. A list of three ward names with a count beside each
 * tells them nothing, and a reader who understands nothing leaves.
 *
 * So this screen answers three questions before it shows any data: what the
 * system does, what the number on every row means, and where to look first.
 * The clinical screens behind it stay dense, because the people who use those
 * already know.
 *
 * The breakdown each ward shows comes from the server, in the same query that
 * counts the beds — not from fetching all three boards and adding them up in
 * the browser. That would be the N+1 problem wearing a different hat, in a
 * project that has an ADR about not doing it.
 */
import { Link } from 'react-router-dom';

import { useResource } from '../api';
import type { WardRisk, WardSummary } from '../types';

/**
 * The bands, in the order a handover reads them: worst first.
 *
 * Each carries the sentence that explains it, because the whole point of this
 * screen is that the reader does not arrive knowing. The wording is the
 * Royal College of Physicians' escalation guidance in plain English, not a
 * clinical instruction — this system scores, it does not prescribe.
 */
const BANDS = [
  {
    key: 'high',
    label: 'high',
    risk: 'high',
    of: (risk: WardRisk) => risk.high,
    meaning: 'A total of 7 or more. The response is immediate and senior.',
  },
  {
    key: 'medium',
    label: 'medium',
    risk: 'medium',
    of: (risk: WardRisk) => risk.medium,
    meaning: 'A total of 5 or 6. Urgent review, and the rounds get closer together.',
  },
  {
    key: 'lowMedium',
    label: 'low-medium',
    risk: 'low-medium',
    of: (risk: WardRisk) => risk.lowMedium,
    meaning:
      'A low total, but one single reading at the extreme. This is the patient who looks stable and is not — the reason the rule exists.',
  },
  {
    key: 'low',
    label: 'low',
    risk: 'low',
    of: (risk: WardRisk) => risk.low,
    meaning: 'A total of 4 or less, with nothing at the extreme. Routine observation.',
  },
  {
    key: 'unscored',
    label: 'not scored',
    risk: null,
    of: (risk: WardRisk) => risk.unscored,
    meaning:
      'Nobody has recorded vital signs yet, or the patient is under sixteen, whom this system does not score. Not an absence of risk — an absence of measurement.',
  },
] as const;

export function WardList() {
  const { data, loading, error } = useResource<WardSummary[]>('/wards');

  if (loading) {
    return <p className="state">Loading wards…</p>;
  }

  if (error !== null) {
    return (
      <p className="state" data-kind="error">
        The API did not answer: {error.message}. Is it running on port 3000?
      </p>
    );
  }

  if (data === null || data.length === 0) {
    return <p className="state">No wards yet. Run a synchronisation first.</p>;
  }

  const total = data.reduce(sumRisk, emptyRisk());
  const inBeds = data.reduce((sum, ward) => sum + ward.openAdmissions, 0);
  const needingAttention = total.high + total.medium + total.lowMedium;

  return (
    <>
      <p className="lede">
        A hospital records a patient&rsquo;s breathing, pulse, blood pressure, temperature and
        alertness every few hours. VitaLink reads those rounds out of the hospital&rsquo;s own
        system and turns each one into a single number — <strong>NEWS2</strong>, the national
        early warning score — so that a patient getting worse is visible now, rather than at
        the next shift change.
      </p>

      <dl className="tiles tiles-headline">
        <Headline label="patients in a bed" value={inBeds} />
        <Headline
          label="need attention now"
          value={needingAttention}
          hint="high, medium or a single reading at the extreme"
          kind={needingAttention > 0 ? 'warn' : undefined}
        />
        <Headline
          label="waiting for an intensive care bed"
          value={total.awaitingCriticalCare}
          hint="asked for, not yet given"
          kind={total.awaitingCriticalCare > 0 ? 'warn' : undefined}
        />
        <Headline
          label="admissions on record"
          value={data.reduce((sum, ward) => sum + ward.totalAdmissions, 0)}
          hint="open and closed"
        />
      </dl>

      <h2 className="section-title">Wards</h2>

      <ul className="ward-list">
        {data.map((ward) => (
          // The key tells React which item is which between renders. Without
          // it, reordering the list makes React rebuild every row instead of
          // moving them.
          <li key={ward.ward}>
            <Link to={`/wards/${encodeURIComponent(ward.ward)}`}>
              <div className="card ward-card">
                <div className="ward-head">
                  <span className="ward-name">{ward.ward}</span>
                  <span className="ward-counts">
                    {ward.openAdmissions} in a bed · {ward.totalAdmissions} in total
                  </span>
                </div>

                <RiskBar risk={ward.risk} of={ward.openAdmissions} />

                <div className="ward-bands">
                  {BANDS.filter((band) => band.of(ward.risk) > 0).map((band) => (
                    <span className="ward-band" key={band.key}>
                      <span className="dot" data-risk={band.risk ?? 'unscored'} aria-hidden="true" />
                      {band.of(ward.risk)} {band.label}
                    </span>
                  ))}
                  {ward.risk.awaitingCriticalCare > 0 && (
                    <span className="flag" data-kind="critical-care">
                      {ward.risk.awaitingCriticalCare} awaiting intensive care
                    </span>
                  )}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <section className="card section">
        <h3>What the bands mean</h3>
        <dl className="legend">
          {BANDS.map((band) => (
            <div className="legend-row" key={band.key}>
              <dt>
                <span className="dot" data-risk={band.risk ?? 'unscored'} aria-hidden="true" />
                {band.label}
              </dt>
              <dd>{band.meaning}</dd>
            </div>
          ))}
        </dl>
        <p className="disclaimer">
          The colour is the third signal and never the only one: every row carries the number
          and the word as well. Measured against this surface, two of these hues sit closer
          together than the threshold at which people with full colour vision reliably tell
          two colours apart — and they are the pair the escalation threshold runs between.
        </p>
      </section>

      <p className="subtle">
        <Link to="/sync">How the data gets here →</Link>
      </p>
    </>
  );
}

/**
 * The breakdown as one bar.
 *
 * Decorative on purpose: `aria-hidden`, and every number in it is written out
 * in words directly underneath. A reader who cannot see the bar loses nothing,
 * and a reader who can gets the shape of the ward in one glance.
 */
function RiskBar({ risk, of }: { risk: WardRisk; of: number }) {
  if (of === 0) {
    return <p className="subtle">No patients in a bed right now.</p>;
  }

  return (
    <div className="risk-bar" aria-hidden="true">
      {BANDS.map((band) => {
        const count = band.of(risk);

        if (count === 0) {
          return null;
        }

        return (
          <span
            key={band.key}
            className="risk-slice"
            data-risk={band.risk ?? 'unscored'}
            style={{ width: `${(count / of) * 100}%` }}
          />
        );
      })}
    </div>
  );
}

function Headline({
  label,
  value,
  hint,
  kind,
}: {
  label: string;
  value: number;
  hint?: string;
  kind?: 'warn';
}) {
  return (
    <div className="tile" data-kind={kind}>
      <dd>{value}</dd>
      <dt>
        {label}
        {hint !== undefined && <span className="hint">{hint}</span>}
      </dt>
    </div>
  );
}

function emptyRisk(): WardRisk {
  return { awaitingCriticalCare: 0, high: 0, medium: 0, lowMedium: 0, low: 0, unscored: 0 };
}

function sumRisk(total: WardRisk, ward: WardSummary): WardRisk {
  return {
    awaitingCriticalCare: total.awaitingCriticalCare + ward.risk.awaitingCriticalCare,
    high: total.high + ward.risk.high,
    medium: total.medium + ward.risk.medium,
    lowMedium: total.lowMedium + ward.risk.lowMedium,
    low: total.low + ward.risk.low,
    unscored: total.unscored + ward.risk.unscored,
  };
}
