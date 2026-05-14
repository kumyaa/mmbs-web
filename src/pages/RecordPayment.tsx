/**
 * S-10 — Record Payment.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { db } from '../db/db';
import type { FyCell } from '../db/schema';
import { useAuth } from '../auth/AuthContext';
import { PushQueue } from '../sync/PushQueue';
import { buildFyOptions, currentFyLabel } from '../domain/FinancialYear';
import { format } from 'date-fns';

const STATUS_OPTIONS = ['New', 'Renewed', 'Unpaid', 'Lapsed'];

export function RecordPayment() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { getToken, spreadsheetId } = useAuth();

  const [memberName, setMemberName] = useState('');
  const [fy, setFy] = useState(searchParams.get('fy') ?? currentFyLabel());
  const [status, setStatus] = useState('New');
  const [amount, setAmount] = useState('500');
  const [date, setDate] = useState(format(new Date(), 'dd-MMM-yyyy'));
  const [receipt, setReceipt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fyOptions = buildFyOptions();

  useEffect(() => {
    if (!id) return;
    db.members.get(id).then((m) => {
      if (m) setMemberName(m.primaryName);
    });
    // Pre-fill from existing cell
    db.membershipRows.get(id).then((row) => {
      if (!row) return;
      try {
        const map = JSON.parse(row.feesJson ?? '{}') as Record<string, FyCell>;
        const targetFy = searchParams.get('fy') ?? currentFyLabel();
        const cell = map[targetFy];
        if (cell) {
          setStatus(cell.status || 'New');
          setAmount(cell.amount || '500');
          setDate(cell.date || format(new Date(), 'dd-MMM-yyyy'));
          setReceipt(cell.receipt || '');
        }
      } catch { /* ignore */ }
    });
  }, [id, searchParams]);

  const save = async () => {
    if (!fy) { setError('Please select a financial year.'); return; }
    setError(null);
    setSaving(true);

    try {
      const existing = await db.membershipRows.get(id!);
      let feesMap: Record<string, FyCell> = {};
      if (existing) {
        try { feesMap = JSON.parse(existing.feesJson ?? '{}'); } catch { /* ignore */ }
      }

      feesMap[fy] = { status, amount, date, receipt };

      const updated = {
        ...(existing ?? {
          memberId: id!,
          sheetRowIndex: undefined,
          lastSheetModifiedTime: undefined,
          pushError: undefined,
        }),
        memberId: id!,
        feesJson: JSON.stringify(feesMap),
        syncStatus: 'PENDING' as const,
        lastLocalModifiedAt: Date.now(),
      };

      await db.membershipRows.put(updated);

      if (spreadsheetId) {
        PushQueue.schedule(spreadsheetId, getToken, () => {});
      }

      navigate(`/members/${id}`, { replace: true });
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const whatsappUrl = () => {
    const mobile = ''; // TODO: fetch primary mobile
    const msg = encodeURIComponent(
      `Dear ${memberName}, your MMBS membership fee for FY ${fy} has been recorded.\n` +
      `Status: ${status}, Amount: ₹${amount}, Date: ${date}.`,
    );
    return `https://wa.me/${mobile}?text=${msg}`;
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <div className="bg-primary-500 text-white px-4 pt-12 pb-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-white/80 p-1">←</button>
        <h1 className="text-lg font-bold">Record Payment</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700">{memberName}</p>

          <div>
            <label className="text-xs text-gray-500">Financial Year</label>
            <select
              value={fy}
              onChange={(e) => setFy(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1 bg-white"
            >
              {fyOptions.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-500">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1 bg-white"
            >
              {STATUS_OPTIONS.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-500">Amount (₹)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500">Date</label>
            <input
              type="text"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              placeholder="dd-MMM-yyyy"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500">Receipt #</label>
            <input
              type="text"
              value={receipt}
              onChange={(e) => setReceipt(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            onClick={save}
            disabled={saving}
            className="w-full bg-primary-500 text-white rounded-xl py-3 font-semibold text-sm disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Payment'}
          </button>

          <a
            href={whatsappUrl()}
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center justify-center gap-2 border border-green-400 text-green-700 rounded-xl py-2.5 text-sm font-medium"
          >
            <span>📲</span> Send WhatsApp Receipt
          </a>
        </div>
      </div>
    </div>
  );
}
