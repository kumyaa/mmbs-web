/**
 * S-13 — Upload HDFC bank statement (.xlsx), preview first 10 rows, show summary.
 * Passes the parsed statement to S-14 (ReconMatch) via navigation state.
 */
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { readXlsx } from '../domain/recon/XlsxReader';
import { parseHdfcStatement } from '../domain/recon/HdfcParser';
import type { ParsedStatement } from '../domain/recon/HdfcParser';
import { BottomNav } from '../components/BottomNav';
import { format } from 'date-fns';

function fmtDate(d: Date | null) {
  return d ? format(d, 'dd-MMM-yyyy') : '—';
}
function fmtAmt(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ReconUpload() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [parsed, setParsed]   = useState<ParsedStatement | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.xlsx')) {
      setError('Only .xlsx files are supported. Please export from HDFC NetBanking as .xlsx.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const rows = await readXlsx(file);
      const stmt = parseHdfcStatement(rows);
      const warns = stmt.validate();
      setParsed(stmt);
      setWarnings(warns);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const proceed = () => {
    if (!parsed) return;
    navigate('/recon/match', { state: { statement: parsed } });
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <div className="bg-primary-500 text-white px-4 pt-12 pb-4">
        <h1 className="text-lg font-bold">Bank Reconciliation</h1>
        <p className="text-xs text-primary-200 mt-0.5">Upload HDFC statement</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Upload area */}
        <div
          onClick={() => inputRef.current?.click()}
          className="bg-white border-2 border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer active:bg-gray-50"
        >
          <div className="text-4xl mb-3">📂</div>
          <p className="text-sm font-medium text-gray-700">Tap to select HDFC statement</p>
          <p className="text-xs text-gray-400 mt-1">.xlsx only (export from HDFC NetBanking)</p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = '';
            }}
          />
        </div>

        {loading && (
          <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 p-4">
            <span className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-600">Parsing statement…</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-amber-700 mb-1">Validation warnings</p>
            {warnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-600">• {w}</p>
            ))}
          </div>
        )}

        {parsed && (
          <>
            {/* Summary card */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Statement Summary</h2>
              <SumRow label="Account"        value={parsed.accountNumber ?? '—'} />
              <SumRow label="Holder"         value={parsed.accountHolder ?? '—'} />
              <SumRow label="Period"         value={`${fmtDate(parsed.summary.periodFrom)} – ${fmtDate(parsed.summary.periodTo)}`} />
              <SumRow label="Opening Bal."   value={fmtAmt(parsed.summary.openingBalance)} />
              <SumRow label="Total Credits"  value={fmtAmt(parsed.summary.totalCredits)} />
              <SumRow label="Total Debits"   value={fmtAmt(parsed.summary.totalDebits)} />
              <SumRow label="Closing Bal."   value={fmtAmt(parsed.summary.closingBalance)} bold />
              <SumRow label="Transactions"   value={`${parsed.transactions.length} rows`} />
            </div>

            {/* Preview first 10 rows */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">
                Preview (first {Math.min(10, parsed.transactions.length)} rows)
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 border-b">
                      <th className="text-left pb-1 pr-2">Date</th>
                      <th className="text-left pb-1 pr-2">Narration</th>
                      <th className="text-right pb-1">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.transactions.slice(0, 10).map((t, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-1.5 pr-2 text-gray-600 whitespace-nowrap">
                          {format(t.date, 'dd-MMM')}
                        </td>
                        <td className="py-1.5 pr-2 text-gray-700 max-w-[160px] truncate">
                          {t.narration}
                        </td>
                        <td className={`py-1.5 text-right font-medium ${t.isCredit ? 'text-green-600' : 'text-red-600'}`}>
                          {t.isCredit ? '+' : '-'}{fmtAmt(Math.abs(t.amount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <button
              onClick={proceed}
              className="w-full bg-primary-500 text-white rounded-xl py-3 font-semibold text-sm shadow-sm"
            >
              Proceed to Match →
            </button>
          </>
        )}

        <div className="h-20" />
      </div>

      <BottomNav />
    </div>
  );
}

function SumRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between py-1.5 border-b last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-sm text-right ${bold ? 'font-bold text-gray-800' : 'text-gray-700'}`}>{value}</span>
    </div>
  );
}
