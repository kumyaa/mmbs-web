/**
 * S-15 — Reconciliation summary.
 * Shows aggregate figures and writes results to the Bank Reconciliation sheet.
 */
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import type { ParsedStatement } from '../domain/recon/HdfcParser';
import type { MatchResult } from '../domain/recon/ReconMatcher';
import { valuesAppend } from '../sync/SheetsClient';
import { db } from '../db/db';
import { format } from 'date-fns';

function fmtAmt(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ReconSummary() {
  const location = useLocation();
  const navigate = useNavigate();
  const { getToken, spreadsheetId } = useAuth();

  const state = location.state as {
    results?: MatchResult[];
    statement?: ParsedStatement;
  } | null;

  const results   = state?.results ?? [];
  const statement = state?.statement;

  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState<string | null>(null);

  if (!statement) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-gray-500 mb-4">No reconciliation data. Please start from Upload.</p>
          <button onClick={() => navigate('/recon')} className="text-primary-500 underline text-sm">
            Back to Upload
          </button>
        </div>
      </div>
    );
  }

  // Aggregate stats
  const matched   = results.filter((r) => r.appTxn && r.overrideStatus !== 'EXCLUDED').length;
  const excluded  = results.filter((r) => r.overrideStatus === 'EXCLUDED').length;
  const unmatched = results.filter((r) => !r.appTxn && r.overrideStatus !== 'EXCLUDED').length;
  const totalRows = results.length;

  const unmatchedBankCR = results
    .filter((r) => !r.appTxn && r.overrideStatus !== 'EXCLUDED' && r.bankRow.isCredit)
    .reduce((s, r) => s + (r.bankRow.deposit ?? 0), 0);

  const unmatchedBankDR = results
    .filter((r) => !r.appTxn && r.overrideStatus !== 'EXCLUDED' && r.bankRow.isDebit)
    .reduce((s, r) => s + (r.bankRow.withdrawal ?? 0), 0);

  const saveToSheet = async () => {
    if (!spreadsheetId) { setError('No spreadsheet connected.'); return; }
    setSaving(true);
    setError(null);

    try {
      const today = format(new Date(), 'dd-MMM-yyyy');

      // Write each matched row to Bank Reconciliation sheet
      // Columns: Bank Date | Narration | Ref | Amount | CR/DR | Matched TXN ID |
      //          Confidence | App Description | Recon Date | Status | Notes
      const rows: string[][] = results
        .filter((r) => r.overrideStatus !== 'EXCLUDED')
        .map((r) => [
          format(r.bankRow.date, 'dd-MMM-yyyy'),
          r.bankRow.narration,
          r.bankRow.reference,
          String(Math.abs(r.bankRow.amount)),
          r.bankRow.isCredit ? 'CR' : 'DR',
          r.appTxn?.txnId ?? '',
          r.appTxn ? r.confidence : '',
          r.appTxn?.description ?? r.appTxn?.category ?? '',
          r.appTxn ? today : '',
          r.appTxn ? 'Matched' : 'Unmatched',
          r.overrideStatus === 'MANUAL' ? 'Manual link' : '',
        ]);

      await valuesAppend(
        spreadsheetId,
        'Bank Reconciliation!A:K',
        rows,
        getToken,
      );

      // Update matched txns in Dexie as reconciled (just a note in their records)
      for (const r of results) {
        if (r.appTxn && r.overrideStatus !== 'EXCLUDED') {
          await db.transactions.update(r.appTxn.txnId, {
            notes: `Reconciled ${today}`,
            syncStatus: 'PENDING',
            lastLocalModifiedAt: Date.now(),
          });
        }
      }

      setSaved(true);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <div className="bg-primary-500 text-white px-4 pt-12 pb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-white/80 p-1 text-lg">←</button>
          <h1 className="text-lg font-bold">Reconciliation Summary</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Totals */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Statement</h2>
          <Row label="Opening Balance"  value={fmtAmt(statement.summary.openingBalance)} />
          <Row label="Total Credits"    value={fmtAmt(statement.summary.totalCredits)} />
          <Row label="Total Debits"     value={fmtAmt(statement.summary.totalDebits)} />
          <Row label="Closing Balance"  value={fmtAmt(statement.summary.closingBalance)} bold />
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Matching Results</h2>
          <Row label="Total bank rows"  value={String(totalRows)} />
          <Row label="Matched"          value={String(matched)} color="green" />
          <Row label="Unmatched"        value={String(unmatched)} color={unmatched > 0 ? 'red' : 'gray'} />
          <Row label="Excluded"         value={String(excluded)} />
          <Row label="Unmatched CR"     value={fmtAmt(unmatchedBankCR)} />
          <Row label="Unmatched DR"     value={fmtAmt(unmatchedBankDR)} />
        </div>

        {saved ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <p className="text-green-700 font-semibold">✓ Saved to Bank Reconciliation sheet</p>
            <button
              onClick={() => navigate('/recon')}
              className="mt-3 text-sm text-green-600 underline"
            >
              Back to Upload
            </button>
          </div>
        ) : (
          <>
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
            <button
              onClick={saveToSheet}
              disabled={saving}
              className="w-full bg-primary-500 text-white rounded-xl py-3 font-semibold text-sm shadow-sm disabled:opacity-50"
            >
              {saving ? 'Saving to sheet…' : 'Save to Bank Reconciliation Sheet'}
            </button>
          </>
        )}

        <div className="h-8" />
      </div>
    </div>
  );
}

function Row({
  label, value, bold, color,
}: {
  label: string; value: string; bold?: boolean; color?: 'green' | 'red' | 'gray';
}) {
  const cls = color === 'green' ? 'text-green-600'
    : color === 'red'   ? 'text-red-600'
    : bold              ? 'font-bold text-gray-800'
    : 'text-gray-700';
  return (
    <div className="flex justify-between py-1.5 border-b last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-sm ${cls}`}>{value}</span>
    </div>
  );
}
