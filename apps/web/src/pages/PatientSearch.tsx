/**
 * Finding one person, wherever they are.
 *
 * The ward board answers "who in this ward needs attention first". This
 * screen answers a different question — "where is Verónica Vázquez" — and the
 * board cannot answer it: a board knows its own ward, and only the patients
 * currently in a bed. Somebody holding a phone call needs the other one.
 *
 * Two decisions worth naming.
 *
 * The search runs on the server. It would have been less code to fetch every
 * patient once and filter in the browser, and it would work until the ward
 * stopped being twenty-five people. Filtering where the data is also means
 * the accent folding happens in one place, in SQL, rather than being
 * reimplemented here in a way that could quietly disagree with it.
 *
 * The typing is debounced. Every keystroke is a request otherwise, and the
 * answers can arrive out of order — type "vaz" quickly and the answer for
 * "va" may land after the answer for "vaz" and overwrite it. The delay is the
 * cheap half of the fix; `useResource` aborting the previous request is the
 * other half.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useResource } from '../api';
import { riskLabel, sexInitial, timeAgo } from '../format';
import type { Page, PatientSearchResult } from '../types';

/**
 * Long enough that an ordinary typist does not fire a request per letter,
 * short enough that the list feels like it is keeping up. Measured against
 * nothing: this is a feel, and it is written down as one.
 */
const TYPING_PAUSE_MS = 250;

const PAGE_SIZE = 25;

export function PatientSearch() {
  const [query, setQuery] = useState('');
  const [settled, setSettled] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSettled(query), TYPING_PAUSE_MS);

    // Cleared on every change, so the timer only fires once typing stops.
    return () => clearTimeout(timer);
  }, [query]);

  const { data, loading, error } = useResource<Page<PatientSearchResult>>(
    `/patients/search?q=${encodeURIComponent(settled.trim())}&pageSize=${PAGE_SIZE}`,
  );

  return (
    <>
      <div className="board-head">
        <h2>Find a patient</h2>
        <span className="meta">across every ward, admitted or not</span>
      </div>

      <p className="lede">
        By family name, given name or medical record number. Accents do not have to
        match — searching <strong>vazquez</strong> finds <strong>VÁZQUEZ</strong>, and the
        other way round.
      </p>

      <input
        className="search search-wide"
        type="search"
        placeholder="Name or MRN"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Search by name or medical record number"
        autoFocus
      />

      <Results data={data} loading={loading} error={error} query={settled} />
    </>
  );
}

function Results({
  data,
  loading,
  error,
  query,
}: {
  data: Page<PatientSearchResult> | null;
  loading: boolean;
  error: Error | null;
  query: string;
}) {
  if (error !== null) {
    return (
      <p className="state" data-kind="error">
        The search did not answer: {error.message}
      </p>
    );
  }

  // The previous results stay on screen while the next ones load. Emptying
  // the list on every keystroke makes a search feel broken even when it is
  // fast.
  if (data === null) {
    return <p className="state">{loading ? 'Searching…' : 'No results.'}</p>;
  }

  if (data.data.length === 0) {
    return (
      <p className="state">
        {query.trim() === ''
          ? 'No patients on record yet.'
          : `Nobody matches “${query.trim()}”.`}
      </p>
    );
  }

  return (
    <table className="board">
      <caption>
        {found(data.total)}
        {data.total > data.data.length && `, showing the first ${data.data.length}`}. Ordered
        by name.
      </caption>
      <thead>
        <tr>
          <th scope="col">Patient</th>
          <th scope="col">MRN</th>
          <th scope="col">Where</th>
          <th scope="col">NEWS2</th>
        </tr>
      </thead>
      <tbody>
        {data.data.map((patient) => (
          <tr key={patient.mrn}>
            <td>
              <span className="patient-name">
                {patient.familyName}, {patient.givenName}
              </span>
              <span className="patient-meta">
                {patient.age} {sexInitial(patient.sex)}
              </span>
            </td>
            <td className="mrn">{patient.mrn}</td>
            <td>
              <Whereabouts patient={patient} />
            </td>
            <td>
              <Score patient={patient} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Where the person is.
 *
 * "Not in a bed" is an answer, not a blank. A row that left this empty would
 * read as missing data about somebody who is in fact at home.
 */
function Whereabouts({ patient }: { patient: PatientSearchResult }) {
  const { current } = patient;

  if (current === null) {
    return <span className="subtle">not in a bed</span>;
  }

  return (
    <>
      <Link className="patient-name" to={`/admissions/${encodeURIComponent(current.admissionId)}`}>
        {current.ward}
      </Link>
      <span className="patient-meta">admitted {timeAgo(current.admittedAt)}</span>
      {current.awaitingCriticalCare && (
        <span className="flag" data-kind="critical-care">
          awaiting critical care
        </span>
      )}
    </>
  );
}

/** The number, then the word. The dot only agrees with them. */
function Score({ patient }: { patient: PatientSearchResult }) {
  const { current } = patient;

  if (current === null) {
    return <span className="subtle">—</span>;
  }

  if (current.aggregate === null) {
    return <span className="subtle">not measured</span>;
  }

  return (
    <span className="score">
      <span className="aggregate">{current.aggregate}</span>
      <span className="band">
        <span className="dot" data-risk={current.risk ?? 'unscored'} aria-hidden="true" />
        {riskLabel(current.risk, 'scored')}
      </span>
    </span>
  );
}

function found(total: number): string {
  return `${total} ${total === 1 ? 'patient' : 'patients'} found`;
}
