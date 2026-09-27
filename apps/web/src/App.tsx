/**
 * The layout and the routing table.
 *
 * A route maps a URL to a component. That mapping is what makes the back
 * button, a bookmark and a shared link work in an application that never
 * reloads the page — the URL stays the source of truth for what is on
 * screen, instead of a variable in memory that only this tab knows about.
 */
import { Link, Route, Routes } from 'react-router-dom';

import { PatientDetail } from './pages/PatientDetail';
import { WardBoard } from './pages/WardBoard';
import { WardList } from './pages/WardList';

export function App() {
  return (
    <div className="layout">
      <header className="masthead">
        <h1>
          <Link to="/" style={{ textDecoration: 'none' }}>
            VitaLink
          </Link>
        </h1>
        <p>Ward board — synthetic data</p>
      </header>

      <Routes>
        <Route path="/" element={<WardList />} />
        <Route path="/wards/:ward" element={<WardBoard />} />
        <Route path="/admissions/:admissionId" element={<PatientDetail />} />
        <Route path="*" element={<p className="state">No such page.</p>} />
      </Routes>
    </div>
  );
}
