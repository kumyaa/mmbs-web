/**
 * S-16 — Settings.
 */
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { db } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatDistanceToNow } from 'date-fns';
import { BottomNav } from '../components/BottomNav';

export function Settings() {
  const { email, role, spreadsheetId, signOut } = useAuth();
  const navigate = useNavigate();

  const lastSyncRow = useLiveQuery(() => db.configKv.get('lastSyncAt'), []);
  const lastSyncAt = lastSyncRow?.value ? parseInt(lastSyncRow.value, 10) : undefined;

  const handleSignOut = () => {
    signOut();
    navigate('/signin', { replace: true });
  };

  const handleChangeSpreadsheet = async () => {
    await db.configKv.delete('spreadsheetId');
    navigate('/setup', { replace: true });
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <div className="bg-primary-500 text-white px-4 pt-12 pb-4">
        <h1 className="text-lg font-bold">Settings</h1>
      </div>

      <div className="flex-1 px-4 py-4 space-y-3">
        <Card>
          <Row label="Signed in as" value={email ?? '—'} />
          <Row label="Role" value={role ?? '—'} />
          {lastSyncAt && (
            <Row
              label="Last synced"
              value={formatDistanceToNow(lastSyncAt, { addSuffix: true })}
            />
          )}
          <Row
            label="Spreadsheet ID"
            value={spreadsheetId ? `${spreadsheetId.slice(0, 16)}…` : '—'}
          />
        </Card>

        <Card>
          <button
            onClick={handleChangeSpreadsheet}
            className="w-full text-left py-3 text-sm text-blue-600 font-medium"
          >
            Change spreadsheet…
          </button>
          <div className="border-t" />
          <button
            onClick={handleSignOut}
            className="w-full text-left py-3 text-sm text-red-600 font-medium"
          >
            Sign out
          </button>
        </Card>

        <p className="text-xs text-center text-gray-400">MMBS Tracker v0.1.0</p>
      </div>
      <div className="h-20" />
      <BottomNav />
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 divide-y">
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-3">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm text-gray-800 font-medium max-w-[55%] text-right truncate">{value}</span>
    </div>
  );
}
