/**
 * Where the browser hands control to React, and the only place it happens.
 *
 * `createRoot` attaches React to the empty div in index.html; from then on
 * React owns everything inside it. StrictMode is a development-only wrapper
 * that deliberately renders every component twice, which is not a bug: it is
 * how React surfaces components that misbehave when run more than once. It
 * disappears entirely from the production build.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';

import { App } from './App';
import { IS_DEMO } from './demo/demo';
import './styles.css';

/**
 * Two routers, one reason.
 *
 * BrowserRouter puts the route in the path, which needs a server that answers
 * every path with index.html. The demo is a folder of static files on a host
 * that knows nothing about this application's routes, so a reload of
 * /admissions/ADM-000016 there would be a 404 from the host before React ever
 * ran. HashRouter puts the route after a #, which no server ever sees.
 */
const Router = IS_DEMO ? HashRouter : BrowserRouter;

const container = document.getElementById('root');

if (container === null) {
  throw new Error('index.html has no #root element.');
}

createRoot(container).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>,
);
