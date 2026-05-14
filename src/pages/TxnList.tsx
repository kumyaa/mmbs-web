/**
 * S-11 — Transaction List (Phase C stub).
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/db';
import { BottomNav } from '../components/BottomNav';
import { SyncIcon } from '../components/SyncIcon';
import { useAuth } from '../auth/AuthContext';

export function TxnList() {
  const navigate = useNavigate();
  const { role } = useAuth();

  const txns = useLiveQuery(
    () => db.transactions.orderBy('date').reverse().toArray(),
    [], [],
  );

  const fmt = (n: number) =>
    n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <div className="bg-primary-500 text-white px-4 pt-12 pb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">Transactions</h1>
          {role !== 'Auditor' && (
            <button
              onClick={() => navigate('/txns/new')}
              className="bg-white/20 rounded-full w-8 h-8 flex items-center justify-center text-lg"
            >
              +
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {txns?.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-12">No transactions.</p>
        )}
        {txns?.map((t) => (
          <button
            key={t.txnId}
            onClick={() => navigate(`/txns/${t.txnId}`)}
            className="w-full flex items-center gap-3 px-4 py-3 bg-white active:bg-gray-50 text-left"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-800 truncate text-sm">
                  {t.description || t.category}
                </span>
                <SyncIcon status={t.syncStatus} error={t.pushError} />
              </div>
              <div className="text-xs text-gray-500 mt-0.5">{t.date} · {t.txnId}</div>
            </div>
            <div className="text-right flex-shrink-0">
              <div
                className={`text-sm font-semibold ${
                  t.type === 'Income' ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {t.type === 'Income' ? '+' : '-'}₹{fmt(t.amount)}
              </div>
              <div className="text-xs text-gray-400">Bal ₹{fmt(t.runningBalance)}</div>
            </div>
          </button>
        ))}
      </div>

      <div className="h-20" />
      <BottomNav />
    </div>
  );
}
