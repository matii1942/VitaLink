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
import { Link, useParams } from 'react-router-dom';

import { useResource } from '../api';
import { riskLabel, sexInitial, timeAgo } from '../format';
import type { WardBoard as WardBoardData, WardBoardRow } from '../types';

/** The filters the counters offer, in the order they are shown. */
const BANDS = [
  { key: 'critical-care', label: 'awaiting critical care', risk: null },
  { key: 'high', label: 'high', risk: 'high' },
  { key: 'medium', label: 'medium', risk: 'medium' },
  { key: 'low-medium', label: 'low-medium', risk: 'low-medium' },
  { key: 'low', label: 'low', risk: 'low' },
] as const;

type BandKey = (typeof BANDS)[number]['key'];

export function WardBoard() {
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
    return <p className="state">Loading the board…</p>;
  }

  if (error !== null) {
    return (
      <p className="state" data-kind="error">
        Could not load {ward}: {error.message}
      </p>
    );
  }

  if (data === null) {
    return <p className="state">No board for {ward}.</p>;
  }

  return (
    <>
      <Link className="back" to="/">
        ← all wards
      </Link>

      <div className="board-head">
        <h2>{data.ward}</h2>
        <span className="meta">
          {data.openAdmissions} in a bed · read {timeAgo(data.generatedAt)}
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
              {entry.label}
            </span>
          </button>
        ))}

        <input
          className="search"
          type="search"
          placeholder="Find a patient by name or MRN"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Find a patient by name or medical record number"
        />
      </div>

      <table className="board">
        <caption>
          {shown.length === rows.length
            ? `${rows.length} patients, ${data.orderedBy}.`
            : `${shown.length} of ${rows.length} patients shown, ${data.orderedBy}.`}
        </caption>
        <thead>
          <tr>
            <th scope="col">NEWS2</th>
            <th scope="col">Patient</th>
            <th scope="col">Diagnosis</th>
            <th scope="col">Last observed</th>
            <th scope="col">Flags</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <Row key={row.admissionId} row={row} />
          ))}
        </tbody>
      </table>

      {shown.length === 0 && <p className="state">No patient matches that filter.</p>}
    </>
  );
}

function Row({ row }: { row: WardBoardRow }) {
  const score = row.latestObservation?.score ?? null;
  const risk = riskOf(row);

  return (
    <tr>
      <td>
        <div className="score">
          <span className="aggregate">{score?.aggregate ?? '—'}</span>
          <span className="band">
            <span className="dot" data-risk={risk ?? 'none'} aria-hidden="true" />
            {riskLabel(score?.risk ?? null, score?.status)}
          </span>
        </div>
      </td>

      <td>
        <Link className="patient-name" to={`/admissions/${encodeURIComponent(row.admissionId)}`}>
          {row.patient.familyName}, {row.patient.givenName}
        </Link>
        <div className="subtle">
          {row.patient.age} {sexInitial(row.patient.sex)} · {row.patient.mrn}
        </div>
      </td>

      <td className="subtle">{row.diagnosis ?? 'not recorded'}</td>

      <td className="subtle nowrap">
        {row.latestObservation === null
          ? 'never'
          : timeAgo(row.latestObservation.recordedAt)}
      </td>

      <td>
        <div className="flags">
          {row.awaitingCriticalCare && row.criticalCareRequest !== null && (
            <span className="flag" data-kind="critical-care">
              awaiting {row.criticalCareRequest.unit}
            </span>
          )}
          {score?.redScore === true && (
            <span className="flag" data-kind="red-score">
              red score
            </span>
          )}
          {score?.partial === true && (
            <span className="flag" data-kind="partial">
              lower bound
            </span>
          )}
          {score?.scaleSource === 'assumed' && (
            <span className="flag" data-kind="assumed">
              scale assumed
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
