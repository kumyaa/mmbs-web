/**
 * S-03 — Full sync progress screen.
 * Shown during first launch and manual refresh.
 */
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { fullPull, type SyncProgress } from '../sync/SyncEngine';
import { useConflicts } from '../sync/ConflictStore';

export function SyncProgressPage() {
  const { getToken, spreadsheetId } = useAuth();
  const { addConflict } = useConflicts();
  const navigate = useNavigate();
  const location = useLocation();
  const [progress, setProgress] = useState<SyncProgress>({
    phase: 'pulling',
    message: 'Connecting…',
  });
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const sid = (location.state as { spreadsheetId?: string } | null)?.spreadsheetId
    ?? spreadsheetId;

  useEffect(() => {
    if (started.current || !sid) return;
    started.current = true;

    fullPull(
      sid,
      getToken,
      (p) => setProgress(p),
      addConflict,
    )
      .then(() => navigate('/home', { replace: true }))
      .catch((e: Error) => {
        setError(e.message);
        setProgress({ phase: 'error', message: e.message });
      });
  }, [sid, getToken, addConflict, navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      {!error && (
        <span className="inline-block w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mb-4" />
      )}
      {error && <p className="text-3xl mb-4">⚠️</p>}

      <h2 className="text-base font-semibold text-gray-800 mb-1">
        {error ? 'Sync failed' : 'Syncing…'}
      </h2>
      <p className="text-sm text-gray-500 max-w-xs">
        {error ?? progress.message}
      </p>

      {error && (
        <div className="mt-5 flex gap-3">
          <button
            onClick={() => { started.current = false; setError(null); }}
            className="bg-primary-500 text-white rounded-lg px-4 py-2 text-sm font-semibold"
          >
            Retry
          </button>
          <button
            onClick={() => navigate('/home', { replace: true })}
            className="border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-600"
          >
            Continue offline
          </button>
        </div>
      )}
    </div>
  );
}
