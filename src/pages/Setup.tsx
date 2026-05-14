/**
 * S-02 — First-launch setup.
 * User pastes the Google Spreadsheet URL or ID.
 * App validates via Drive API, reads AppUsers sheet, gates by email.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { extractSpreadsheetId, validateSpreadsheet } from '../sync/SheetsClient';
import { batchGet } from '../sync/SheetsClient';
import { APP_USERS_RANGE, sheetRowToAppUser } from '../sync/RowMapper';
import { db } from '../db/db';

export function Setup() {
  const { email, getToken, setRole, setSpreadsheetId } = useAuth();
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = async () => {
    setError(null);
    const raw = input.trim();
    if (!raw) { setError('Please paste the spreadsheet URL or ID.'); return; }

    const id = extractSpreadsheetId(raw);
    setLoading(true);

    try {
      // 1. Validate spreadsheet exists
      const title = await validateSpreadsheet(id, getToken);

      // 2. Read AppUsers sheet
      const { valueRanges } = await batchGet(id, [APP_USERS_RANGE], getToken);
      const rows = valueRanges[0].values ?? [];

      // Find the signed-in email (case-insensitive)
      const userRow = rows
        .slice(1) // skip header
        .map(sheetRowToAppUser)
        .find((u) => u.email.toLowerCase() === (email ?? '').toLowerCase());

      if (!userRow) {
        setError(
          `${email} is not listed in the AppUsers sheet. ` +
          'Ask the Treasurer to add your email.',
        );
        setLoading(false);
        return;
      }

      // 3. Persist
      await db.configKv.put({ key: 'spreadsheetId', value: id });
      setSpreadsheetId(id);
      setRole(userRow.role as Parameters<typeof setRole>[0]);

      navigate('/sync', { replace: true, state: { spreadsheetId: id, firstLaunch: true } });
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-1">Connect spreadsheet</h2>
        <p className="text-sm text-gray-500 mb-5">
          Paste the URL or ID of the MMBS Google Sheet.
        </p>

        <label className="text-xs font-medium text-gray-600 mb-1 block">
          Spreadsheet URL or ID
        </label>
        <textarea
          className="w-full border border-gray-300 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
          rows={3}
          placeholder="https://docs.google.com/spreadsheets/d/…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />

        {error && (
          <p className="text-xs text-red-600 mt-2">{error}</p>
        )}

        <button
          onClick={validate}
          disabled={loading}
          className="mt-4 w-full bg-primary-500 text-white rounded-lg py-3 font-semibold text-sm disabled:opacity-50"
        >
          {loading ? 'Validating…' : 'Connect'}
        </button>

        <p className="text-xs text-gray-400 text-center mt-3">Signed in as {email}</p>
      </div>
    </div>
  );
}
