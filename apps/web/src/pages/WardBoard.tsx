/**
 * The ward board.
 *
 * Its job is one question asked at a glance: who needs attention first. The
 * server already answers it — the rows arrive ordered by acuity, by a ranking
 * written in SQL (ADR 0010) that puts a patient waiting for a critical care
 * bed above everyone, then sorts by NEWS2. This screen does not re-sort them.
 * The order is a clinical decision and it belongs where the data is, not in a
 * comparator in the browser that could quietly disagree with it.
 *
 * On reading the board without colour: the score is a number, the band is a
 * word, and every flag carries its own text. The coloured dot is the third
 * signal and never the only one — which is not politeness. Measured against
 * the surface this renders on, the low-medium and medium hues sit closer
 * together than the threshold at which people with full colour vision can
 * tell two colours apart, and that pair is exactly where the escalation
 * threshold runs. A board that leaned on hue would be least readable at the
 * moment it mattered most.
 */
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { useResource } from '../api';
import { riskLabel, sexInitial, timeAgo } from '../format';
import { LangLink, useText } from '../i18n/language';
import type { Strings } from '../i18n/strings';
import type { WardBoard as WardBoardData, WardBoardRow } from '../types';

/** The filters the counters offer, in the order they are shown. */
const BANDS = [
  // The first label is this project's own wording, so it is translated. The
  // four NEWS2 bands are not. See the note in i18n/strings.tsx.
  { key: 'critical-care', label: null, risk: null },
  { key: 'high', label: 'high', risk: 'high' },
  { key: 'medium', label: 'medium', risk: 'medium' },
  { key: 'low-medium', label: 'low-medium', risk: 'low-medium' },
  { key: 'low', label: 'low', risk: 'low' },
] as const;

function bandLabel(band: (typeof BANDS)[number], text: Strings): string {
  return band.label ?? text.board.awaitingCriticalCare;
}

type BandKey = (typeof BANDS)[number]['key'];

export function WardBoard() {
  const text = useText();
  const { ward = '' } = useParams();
  const { data, loading, error } = useResource<WardBoardData>(
    `/wards/${encodeURIComponent(ward)}/board`,
  );

  const [band, setBand] = useState<BandKey | null>(null);
  const [query, setQuery] = useState('');

  const rows = data?.rows ?? [];

  // useMemo keeps this from re-running on every keystroke that does not
  // change the inputs. On twenty-five rows it would not matter; this
  // database still holds the thousand-bed hospital from the query
  // measurements, and it does.
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return rows.filter((row) => {
      if (band === 'critical-care' && !row.awaitingCriticalCare) {
        return false;
      }

      if (band !== null && band !== 'critical-care' && riskOf(row) !== band) {
        return false;
      }

      if (needle === '') {
        return true;
      }

      return `${row.patient.givenName} ${row.patient.familyName} ${row.patient.mrn}`
        .toLowerCase()
        .includes(needle);
    });
  }, [rows, band, query]);

  if (loading) {
    return <p className="state">{text.board.loading}</p>;
  }

  if (error !== null) {
    return (
      <p className="state" data-kind="error">
        {text.board.couldNotLoad(ward, error.message)}
      </p>
    );
  }

  if (data === null) {
    return <p className="state">{text.board.noBoard(ward)}</p>;
  }

  return (
    <>
      <LangLink className="back" to="/">
        {text.board.allWards}
      </LangLink>

      <div className="board-head">
        <h2>{data.ward}</h2>
        <span className="meta">
          {text.board.inABedRead(data.openAdmissions, timeAgo(data.generatedAt, text.time))}
        </span>
      </div>

      <div className="counters">
        {BANDS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className="counter"
            // aria-pressed tells a screen reader that this is a toggle and
            // which way it is set. Without it the button announces itself as
            // an ordinary button and the filter is invisible to anyone not
            // looking at the ring around it.
            aria-pressed={band === entry.key}
            onClick={() => setBand(band === entry.key ? null : entry.key)}
          >
            <span className="value">{countOf(rows, entry.key)}</span>
            <span className="label">
              <span
                className="dot"
                data-risk={entry.risk ?? 'high'}
                // The dot repeats the label beside it, so it is decoration as
                // far as assistive technology is concerned.
                aria-hidden="true"
              />
              {bandLabel(entry, text)}
            </span>
          </button>
        ))}

        <input
          className="search"
          type="search"
          placeholder={text.board.searchPlaceholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={text.board.searchLabel}
        />
      </div>

      <table className="board">
        <caption>
          {/*
            The ordering rule arrives from the server, in the server's own
            words. It is sent precisely so a consumer does not restate it and
            risk describing something the query does not do, so it is shown
            untranslated in both languages — see i18n/strings.tsx.

            `lang` says so out loud. Without it a screen reader set to Spanish
            reads this English sentence with Spanish phonetics, which is worse
            than leaving it untranslated: it becomes unintelligible rather
            than merely foreign. The attribute costs nothing and is the only
            honest way to put one language inside another.
          */}
          {text.board.caption(
            shown.length,
            rows.length,
            <span lang="en">{data.orderedBy}</span>,
          )}
        </caption>
        <thead>
          <tr>
            <th scope="col">{text.board.columns.news2}</th>
            <th scope="col">{text.board.columns.patient}</th>
            <th scope="col">{text.board.columns.diagnosis}</th>
            <th scope="col">{text.board.columns.lastObserved}</th>
            <th scope="col">{text.board.columns.flags}</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <Row key={row.admissionId} row={row} />
          ))}
        </tbody>
      </table>

      {shown.length === 0 && <p className="state">{text.board.noMatch}</p>}
    </>
  );
}

function Row({ row }: { row: WardBoardRow }) {
  const text = useText();
  const score = row.latestObservation?.score ?? null;
  const risk = riskOf(row);

  return (
    <tr>
      <td>
        <div className="score">
          <span className="aggregate">{score?.aggregate ?? '—'}</span>
          <span className="band">
            <span className="dot" data-risk={risk ?? 'none'} aria-hidden="true" />
            {riskLabel(score?.risk ?? null, score?.status, text.common)}
          </span>
        </div>
      </td>

      <td>
        <LangLink className="patient-name" to={`/admissions/${encodeURIComponent(row.admissionId)}`}>
          {row.patient.familyName}, {row.patient.givenName}
        </LangLink>
        <div className="subtle">
          {row.patient.age} {sexInitial(row.patient.sex, text.sex)} · {row.patient.mrn}
        </div>
      </td>

      {/* The diagnosis arrives in Spanish from the hospital. Data is data. */}
      <td className="subtle">{row.diagnosis ?? text.common.notRecorded}</td>

      <td className="subtle nowrap">
        {row.latestObservation === null
          ? text.common.never
          : timeAgo(row.latestObservation.recordedAt, text.time)}
      </td>

      <td>
        <div className="flags">
          {row.awaitingCriticalCare && row.criticalCareRequest !== null && (
            <span className="flag" data-kind="critical-care">
              {text.board.awaiting(row.criticalCareRequest.unit)}
            </span>
          )}
          {score?.redScore === true && (
            <span className="flag" data-kind="red-score">
              {text.board.redScore}
            </span>
          )}
          {score?.partial === true && (
            <span className="flag" data-kind="partial">
              {text.board.lowerBound}
            </span>
          )}
          {score?.scaleSource === 'assumed' && (
            <span className="flag" data-kind="assumed">
              {text.board.scaleAssumed}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

function riskOf(row: WardBoardRow): string | null {
  return row.latestObservation?.score?.risk ?? null;
}

function countOf(rows: WardBoardRow[], key: BandKey): number {
  if (key === 'critical-care') {
    return rows.filter((row) => row.awaitingCriticalCare).length;
  }

  return rows.filter((row) => riskOf(row) === key).length;
}
