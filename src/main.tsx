// ── OAuth callback intercept ───────────────────────────────────────────────
// Google redirects back to the base URL with ?code= in the query string.
// Because we use HashRouter, React won't see these query params natively.
// We detect them here (before React mounts) and rewrite the URL to
//   /#/auth/callback?code=...
// so AuthCallback.tsx picks them up via useSearchParams as normal.
{
  const sp = new URLSearchParams(window.location.search);
  if (sp.has('code') || sp.has('error')) {
    const hashParams = new URLSearchParams();
    if (sp.get('code'))  hashParams.set('code',  sp.get('code')!);
    if (sp.get('error')) hashParams.set('error', sp.get('error')!);
    // Replace current entry so Back button doesn't loop
    window.history.replaceState(
      {},
      '',
      window.location.pathname + '#/auth/callback?' + hashParams.toString(),
    );
  }
}
// ──────────────────────────────────────────────────────────────────────────

import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ConflictProvider } from './sync/ConflictStore';
import { App } from './App';
import { registerUnloadFlush } from './sync/PushQueue';
import './index.css';
import { db } from './db/db';
import { ensureToken } from './auth/oauth';

// Best-effort push on tab hide
registerUnloadFlush(
  () => {
    // Read spreadsheetId from Dexie synchronously is not possible;
    // we rely on the PushQueue.flush() which already has the args cached.
    return null;
  },
  ensureToken,
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <ConflictProvider>
          <App />
        </ConflictProvider>
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>,
);
