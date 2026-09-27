/**
 * The wards that exist, according to the data.
 *
 * Three states, always. A screen that only handles the successful one is a
 * screen that shows an empty box when the API is down and leaves the reader
 * wondering whether the ward is empty or the building is on fire.
 */
import { Link } from 'react-router-dom';

import { useResource } from '../api';
import type { WardSummary } from '../types';

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

  return (
    <ul className="ward-list">
      {data.map((ward) => (
        // The key tells React which item is which between renders. Without
        // it, reordering the list makes React rebuild every row instead of
        // moving them.
        <li key={ward.ward}>
          <Link to={`/wards/${encodeURIComponent(ward.ward)}`}>
            <div className="card">
              <div className="ward-name">{ward.ward}</div>
              <div className="ward-counts">
                {ward.openAdmissions} in a bed · {ward.totalAdmissions} in total
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
