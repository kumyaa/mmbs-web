/**
 * S-05 — Home dashboard.
 * Shows KPI cards, last sync time, and quick-action buttons.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/db';
import { useAuth } from '../auth/AuthContext';
import { BottomNav } from '../components/BottomNav';
import { SyncBanner } from '../components/SyncBanner';
import { ConflictModal } from '../components/ConflictModal';
import { currentFyLabel } from '../domain/FinancialYear';
import type { SyncProgress } from '../sync/SyncEngine';
import { useState } from 'react';
import { fullPull } from '../sync/SyncEngine';
import { useConflicts } from '../sync/ConflictStore';

const CURRENT_FY = currentFyLabel();

export function Home() {
  const { getToken, spreadsheetId, email, role } = useAuth();
  const { addConflict } = useConflicts();
  const navigate = useNavigate();
  const [syncState, setSyncState] = useState<SyncProgress>({ phase: 'idle', message: '' });

  // KPI: active members
  const activeCount = useLiveQuery(
    () => db.members.where('status').equals('Active').count(),
    [], 0,
  );

  // KPI: total members
  const totalCount = useLiveQuery(() => db.members.count(), [], 0);

  // KPI: current-FY paid members
  const paidCount = useLiveQuery(async () => {
    const rows = await db.membershipRows.toArray();
    return rows.filter((r) => {
      try {
        const map = JSON.parse(r.feesJson ?? '{}') as Record<string, { status: string }>;
        const cell = map[CURRENT_FY];
        return cell && (cell.status === 'New' || cell.status === 'Renewed');
      } catch { return false; }
    }).length;
  }, [], 0);

  // KPI: income / expense this FY
  const { income, expense } = useLiveQuery(async () => {
    const all = await db.transactions.toArray();
    let income = 0, expense = 0;
    for (const t of all) {
      // Simple FY check: Apr of startYear through Mar of endYear
      const startYear = parseInt(CURRENT_FY.split('-')[0], 10);
      const txnDate = new Date(t.date);
      const txnFyStart = txnDate.getMonth() >= 3
        ? txnDate.getFullYear()
        : txnDate.getFullYear() - 1;
      if (txnFyStart !== startYear) continue;
      if (t.type === 'Income') income += t.amount;
      else expense += t.amount;
    }
    return { income, expense };
  }, [], { income: 0, expense: 0 }) ?? { income: 0, expense: 0 };

  // Last sync time
  const lastSyncRow = useLiveQuery(() => db.configKv.get('lastSyncAt'), []);
  const lastSyncAt = lastSyncRow?.value ? parseInt(lastSyncRow.value, 10) : undefined;

  const doSync = async () => {
    if (!spreadsheetId) return;
    setSyncState({ phase: 'pulling', message: 'Syncing…' });
    try {
      await fullPull(spreadsheetId, getToken, setSyncState, addConflict);
    } catch (e: unknown) {
      setSyncState({ phase: 'error', message: (e as Error).message });
    }
  };

  const fmt = (n: number) =>
    n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <SyncBanner
        phase={syncState.phase}
        message={syncState.message}
        lastSyncAt={lastSyncAt}
      />
      <ConflictModal />

      {/* Header */}
      <div className="bg-primary-500 text-white px-4 pt-12 pb-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">MMBS Tracker</h1>
            <p className="text-xs text-primary-200 mt-0.5">{email} · {role}</p>
          </div>
          <button
            onClick={doSync}
            disabled={syncState.phase === 'pulling' || syncState.phase === 'pushing'}
            className="bg-white/20 active:bg-white/30 rounded-full p-2 disabled:opacity-50"
            title="Sync now"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0115.54-2M20 15a8 8 0 01-15.54 2" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-primary-200 mt-1">FY {CURRENT_FY}</p>
      </div>

      {/* KPI cards */}
      <div className="px-4 -mt-4 grid grid-cols-2 gap-3">
        <KpiCard label="Active Members" value={String(activeCount)} icon="👥" />
        <KpiCard label="Total Members" value={String(totalCount)} icon="📋" />
        <KpiCard label={`Paid (FY ${CURRENT_FY})`} value={String(paidCount)} icon="✅" />
        <KpiCard label="Unpaid" value={String((activeCount ?? 0) - (paidCount ?? 0))} icon="⏳" />
        <KpiCard label="Income (FY)" value={`₹${fmt(income)}`} icon="📈" />
        <KpiCard label="Expense (FY)" value={`₹${fmt(expense)}`} icon="📉" />
      </div>

      {/* Quick actions */}
      <div className="px-4 mt-5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Quick actions
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <ActionButton label="Add Member" icon="➕" onClick={() => navigate('/members/new')} />
          <ActionButton label="Record Payment" icon="💳" onClick={() => navigate('/members')} />
          <ActionButton label="Add Transaction" icon="📝" onClick={() => navigate('/txns/new')} />
          <ActionButton label="Reconcile" icon="🏦" onClick={() => navigate('/recon')} />
        </div>
      </div>

      {/* Last sync */}
      {lastSyncAt && (
        <p className="text-xs text-gray-400 text-center mt-5">
          Last synced {formatDistanceToNow(lastSyncAt, { addSuffix: true })}
        </p>
      )}

      <div className="h-20" /> {/* bottom nav spacer */}
      <BottomNav />
    </div>
  );
}

function KpiCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-xl font-bold text-gray-800">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

function ActionButton({
  label, icon, onClick,
}: {
  label: string; icon: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-3 text-left active:bg-gray-50"
    >
      <span className="text-xl">{icon}</span>
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </button>
  );
}
