/**
 * Handles the OAuth redirect: ?code=…
 * Exchanges the code for tokens, then navigates to /setup or /home.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { handleCallback, getUserEmail } from '../auth/oauth';
import { useAuth } from '../auth/AuthContext';
import { db } from '../db/db';

export function AuthCallback() {
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setEmail, setRole } = useAuth();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const code = searchParams.get('code');
    const errParam = searchParams.get('error');

    if (errParam) {
      setError(`Google sign-in was cancelled or denied: ${errParam}`);
      return;
    }

    if (!code) {
      setError('No authorisation code received.');
      return;
    }

    handleCallback(code)
      .then(async () => {
        // Push the email into AuthContext state so Setup/Home can read it immediately
        const e = getUserEmail();
        if (e) setEmail(e);

        // Check if spreadsheet is already configured
        const idRow = await db.configKv.get('spreadsheetId');
        if (idRow?.value) {
          navigate('/home', { replace: true });
        } else {
          navigate('/setup', { replace: true });
        }
      })
      .catch((e: Error) => setError(e.message));
  }, [navigate, searchParams, setRole]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <p className="text-red-600 font-medium mb-4">{error}</p>
        <button
          onClick={() => navigate('/signin', { replace: true })}
          className="text-primary-500 underline text-sm"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center">
      <span className="inline-block w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mb-3" />
      <p className="text-sm text-gray-500">Completing sign in…</p>
    </div>
  );
}
