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
import { BrowserRouter } from 'react-router-dom';

import { App } from './App';
import './styles.css';

const container = document.getElementById('root');

if (container === null) {
  throw new Error('index.html has no #root element.');
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
