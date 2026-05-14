/**
 * S-14 — Reconciliation matching UI.
 * Shows each bank row with its auto-match (or "unmatched"), lets the user
 * manually link, exclude, or accept.
 */
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { db } from '../db/db';
import type { TransactionEntity } from '../db/schema';
import type { ParsedStatement } from '../domain/recon/HdfcParser';
import { reconcile, type MatchResult } from '../domain/recon/ReconMatcher';
import { format } from 'date-fns';

function fmtDate(d: Date) {
  return format(d, 'dd-MMM-yy');
}
function fmtAmt(n: number) {
  return `₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function ReconMatch() {
  const location = useLocation();
  const navigate = useNavigate();
  const statement = (location.state as { statement?: ParsedStatement } | null)?.statement;

  const [appTxns, setAppTxns] = useState<TransactionEntity[]>([]);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [linkingIdx, setLinkingIdx] = useState<number | null>(null);
  const [txnSearch, setTxnSearch] = useState('');

  useEffect(() => {
    db.transactions.toArray().then(setAppTxns);
  }, []);

  useEffect(() => {
    if (!statement || appTxns.length === 0) return;
    const r = reconcile(
      statement.transactions,
      appTxns,
      statement.summary.openingBalance,
      statement.summary.closingBalance,
      0,
    );
    setResults(r.matches);
  }, [statement, appTxns]);

  if (!statement) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-gray-500 mb-4">No statement loaded. Please upload first.</p>
          <button onClick={() => navigate('/recon')} className="text-primary-500 underline text-sm">
            Back to Upload
          </button>
        </div>
      </div>
    );
  }

  const matched   = results.filter((r) => r.appTxn && r.overrideStatus !== 'EXCLUDED').length;
  const excluded  = results.filter((r) => r.overrideStatus === 'EXCLUDED').length;
  const unmatched = results.filter((r) => !r.appTxn && r.overrideStatus !== 'EXCLUDED').length;

  const setOverride = (idx: number, status: MatchResult['overrideStatus']) => {
    setResults((prev) => prev.map((r, i) => i === idx ? { ...r, overrideStatus: status } : r));
  };

  const linkManual = (idx: number, txn: TransactionEntity) => {
    setResults((prev) => prev.map((r, i) =>
      i === idx ? { ...r, appTxn: txn, confidence: 'HIGH', matchReason: 'Manual link', overrideStatus: 'MANUAL' } : r,
    ));
    setLinkingIdx(null);
  };

  const filteredTxns = appTxns.filter((t) =>
    t.txnId.includes(txnSearch) ||
    t.description.toLowerCase().includes(txnSearch.toLowerCase()) ||
    String(t.amount).includes(txnSearch),
  );

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-primary-500 text-white px-4 pt-12 pb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-white/80 p-1 text-lg">←</button>
          <div>
            <h1 className="text-lg font-bold">Match Transactions</h1>
            <p className="text-xs text-primary-200">
              {matched} matched · {unmatched} unmatched · {excluded} excluded
            </p>
          </div>
        </div>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {results.map((r, idx) => {
          const isExcluded = r.overrideStatus === 'EXCLUDED';
          const isMatched  = !!r.appTxn && !isExcluded;

          return (
            <div key={idx} className={`bg-white px-4 py-3 ${isExcluded ? 'opacity-50' : ''}`}>
              {/* Bank row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400">{fmtDate(r.bankRow.date)} · {r.bankRow.reference || '—'}</p>
                  <p className="text-sm text-gray-700 truncate">{r.bankRow.narration}</p>
                  {r.narrationHints.length > 0 && (
                    <p className="text-xs text-blue-500 mt-0.5">{r.narrationHints.join(' · ')}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-sm font-semibold ${r.bankRow.isCredit ? 'text-green-600' : 'text-red-600'}`}>
                    {r.bankRow.isCredit ? '+' : '-'}{fmtAmt(r.bankRow.amount)}
                  </p>
                  <p className="text-xs text-gray-400">{r.bankRow.isCredit ? 'CR' : 'DR'}</p>
                </div>
              </div>

              {/* Match status */}
              <div className="mt-2 flex items-center gap-2">
                {isMatched && (
                  <div className="flex-1 bg-green-50 border border-green-200 rounded-lg px-2 py-1.5 text-xs">
                    <span className={`font-semibold mr-1 ${r.confidence === 'HIGH' ? 'text-green-700' : 'text-amber-600'}`}>
                      {r.confidence === 'HIGH' ? '✓ High' : '~ Med'}
                    </span>
                    <span className="text-gray-600">{r.appTxn!.txnId} · {r.appTxn!.description || r.appTxn!.category} · ₹{r.appTxn!.amount}</span>
                  </div>
                )}
                {!isMatched && !isExcluded && (
                  <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-500">
                    Unmatched — {r.matchReason}
                  </div>
                )}
                {isExcluded && (
                  <div className="flex-1 bg-gray-100 rounded-lg px-2 py-1.5 text-xs text-gray-400">
                    Excluded
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-1">
                  {!isExcluded && (
                    <button
                      onClick={() => setLinkingIdx(idx)}
                      className="text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded px-2 py-1"
                    >
                      Link
                    </button>
                  )}
                  <button
                    onClick={() => setOverride(idx, isExcluded ? undefined : 'EXCLUDED')}
                    className="text-xs bg-gray-50 text-gray-500 border border-gray-200 rounded px-2 py-1"
                  >
                    {isExcluded ? 'Undo' : 'Exclude'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Manual link modal */}
      {linkingIdx !== null && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50">
          <div className="bg-white w-full rounded-t-2xl p-5 max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-gray-800">Link to app transaction</h2>
              <button onClick={() => setLinkingIdx(null)} className="text-gray-400 text-lg">✕</button>
            </div>
            <input
              type="search"
              placeholder="Search by ID, description or amount…"
              value={txnSearch}
              onChange={(e) => setTxnSearch(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3"
            />
            <div className="overflow-y-auto flex-1 divide-y">
              {filteredTxns.slice(0, 50).map((t) => (
                <button
                  key={t.txnId}
                  onClick={() => linkManual(linkingIdx!, t)}
                  className="w-full flex items-center justify-between px-1 py-2.5 text-left active:bg-gray-50"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-700">{t.txnId} · {t.description || t.category}</p>
                    <p className="text-xs text-gray-400">{t.date}</p>
                  </div>
                  <p className={`text-sm font-semibold ${t.type === 'Income' ? 'text-green-600' : 'text-red-600'}`}>
                    ₹{t.amount}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Footer action */}
      <div className="bg-white border-t border-gray-200 px-4 py-3 pb-safe">
        <button
          onClick={() => navigate('/recon/summary', { state: { results, statement } })}
          className="w-full bg-primary-500 text-white rounded-xl py-3 font-semibold text-sm"
        >
          Save Reconciliation →
        </button>
      </div>
    </div>
  );
}
