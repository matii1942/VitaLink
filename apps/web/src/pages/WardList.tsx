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


import { useResource } from '../api';
import { LangLink, useText } from '../i18n/language';
import type { Strings } from '../i18n/strings';
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
  { key: 'high', label: 'high', risk: 'high', of: (r: WardRisk) => r.high },
  { key: 'medium', label: 'medium', risk: 'medium', of: (r: WardRisk) => r.medium },
  { key: 'lowMedium', label: 'low-medium', risk: 'low-medium', of: (r: WardRisk) => r.lowMedium },
  { key: 'low', label: 'low', risk: 'low', of: (r: WardRisk) => r.low },
  { key: 'unscored', label: null, risk: null, of: (r: WardRisk) => r.unscored },
] as const;

/** The band's name: the four NEWS2 ones as they are, ours translated. */
function bandLabel(band: (typeof BANDS)[number], text: Strings): string {
  return band.label ?? text.common.notScored;
}

/** The sentence explaining the band, in the language showing. */
function bandMeaning(band: (typeof BANDS)[number], text: Strings): string {
  return text.wards.meaning[band.key];
}

export function WardList() {
  const text = useText();
  const { data, loading, error } = useResource<WardSummary[]>('/wards');

  if (loading) {
    return <p className="state">{text.wards.loading}</p>;
  }

  if (error !== null) {
    return (
      <p className="state" data-kind="error">
        {text.common.apiDidNotAnswer(error.message)}
      </p>
    );
  }

  if (data === null || data.length === 0) {
    return <p className="state">{text.wards.empty}</p>;
  }

  const total = data.reduce(sumRisk, emptyRisk());
  const inBeds = data.reduce((sum, ward) => sum + ward.openAdmissions, 0);
  const needingAttention = total.high + total.medium + total.lowMedium;

  return (
    <>
      <p className="lede">{text.wards.lede}</p>

      <dl className="tiles tiles-headline">
        <Headline label={text.wards.inBeds} value={inBeds} />
        <Headline
          label={text.wards.needAttention}
          value={needingAttention}
          hint={text.wards.needAttentionHint}
          kind={needingAttention > 0 ? 'warn' : undefined}
        />
        <Headline
          label={text.wards.awaitingIcu}
          value={total.awaitingCriticalCare}
          hint={text.wards.awaitingIcuHint}
          kind={total.awaitingCriticalCare > 0 ? 'warn' : undefined}
        />
        <Headline
          label={text.wards.admissionsOnRecord}
          value={data.reduce((sum, ward) => sum + ward.totalAdmissions, 0)}
          hint={text.wards.admissionsHint}
        />
      </dl>

      <h2 className="section-title">{text.wards.title}</h2>

      <ul className="ward-list">
        {data.map((ward) => (
          // The key tells React which item is which between renders. Without
          // it, reordering the list makes React rebuild every row instead of
          // moving them.
          <li key={ward.ward}>
            <LangLink to={`/wards/${encodeURIComponent(ward.ward)}`}>
              <div className="card ward-card">
                <div className="ward-head">
                  {/* The ward's code is data, and data is never translated. */}
                  <span className="ward-name">{ward.ward}</span>
                  <span className="ward-counts">
                    {text.wards.counts(ward.openAdmissions, ward.totalAdmissions)}
                  </span>
                </div>

                <RiskBar risk={ward.risk} of={ward.openAdmissions} />

                <div className="ward-bands">
                  {BANDS.filter((band) => band.of(ward.risk) > 0).map((band) => (
                    <span className="ward-band" key={band.key}>
                      <span className="dot" data-risk={band.risk ?? 'unscored'} aria-hidden="true" />
                      {band.of(ward.risk)} {bandLabel(band, text)}
                    </span>
                  ))}
                  {ward.risk.awaitingCriticalCare > 0 && (
                    <span className="flag" data-kind="critical-care">
                      {text.wards.awaitingIntensiveCare(ward.risk.awaitingCriticalCare)}
                    </span>
                  )}
                </div>
              </div>
            </LangLink>
          </li>
        ))}
      </ul>

      <section className="card section">
        <h3>{text.wards.bandsTitle}</h3>
        <dl className="legend">
          {BANDS.map((band) => (
            <div className="legend-row" key={band.key}>
              <dt>
                <span className="dot" data-risk={band.risk ?? 'unscored'} aria-hidden="true" />
                {bandLabel(band, text)}
              </dt>
              <dd>{bandMeaning(band, text)}</dd>
            </div>
          ))}
        </dl>
        <p className="disclaimer">{text.wards.colourNote}</p>
      </section>

      <p className="subtle">
        <LangLink to="/sync">{text.wards.howDataGetsHere}</LangLink>
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
  const text = useText();

  if (of === 0) {
    return <p className="subtle">{text.wards.noneInABed}</p>;
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
