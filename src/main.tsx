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
