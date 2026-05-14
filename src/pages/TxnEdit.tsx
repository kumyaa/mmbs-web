/**
 * S-12 — Add / Edit Transaction (Phase C stub — full running balance in Phase C).
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../db/db';
import type { TransactionEntity } from '../db/schema';
import { useAuth } from '../auth/AuthContext';
import { PushQueue } from '../sync/PushQueue';
import { format } from 'date-fns';

const TYPE_OPTIONS = ['Income', 'Expense'];
const CATEGORY_OPTIONS = [
  'Membership Fee', 'Donation', 'Event', 'Bank Interest',
  'Office Expense', 'Event Expense', 'Miscellaneous',
];

export function TxnEdit() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { getToken, spreadsheetId } = useAuth();
  const isNew = !id || id === 'new';

  const [form, setForm] = useState<Partial<TransactionEntity>>({
    type: 'Income',
    category: 'Membership Fee',
    date: format(new Date(), 'dd-MMM-yyyy'),
    amount: 0,
    runningBalance: 0,
    linkedMemberId: '',
    receipt: '',
    notes: '',
    description: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew || !id) return;
    db.transactions.get(id).then((t) => { if (t) setForm(t); });
  }, [id, isNew]);

  const set = (k: keyof TransactionEntity, v: string | number) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.description?.trim() && !form.category) {
      setError('Description or category is required.');
      return;
    }
    setError(null);
    setSaving(true);

    try {
      let entity: TransactionEntity;
      if (isNew) {
        // Auto-generate txnId
        const all = await db.transactions.toArray();
        const nums = all
          .map((t) => parseInt(t.txnId.replace(/^TXN-/, ''), 10))
          .filter((n) => !isNaN(n));
        const maxNum = nums.length > 0 ? Math.max(...nums) : 0;
        const txnId = `TXN-${String(maxNum + 1).padStart(4, '0')}`;
        entity = { ...form, txnId } as TransactionEntity;
      } else {
        const existing = await db.transactions.get(id!);
        if (!existing) throw new Error('Transaction not found.');
        entity = { ...existing, ...form } as TransactionEntity;
      }

      await db.transactions.put({
        ...entity,
        syncStatus: 'PENDING',
        lastLocalModifiedAt: Date.now(),
      });

      if (spreadsheetId) {
        PushQueue.schedule(spreadsheetId, getToken, () => {});
      }
      navigate('/txns', { replace: true });
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <div className="bg-primary-500 text-white px-4 pt-12 pb-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-white/80 p-1">←</button>
        <h1 className="text-lg font-bold">{isNew ? 'Add Transaction' : 'Edit Transaction'}</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
          <Select label="Type" value={form.type ?? 'Income'} options={TYPE_OPTIONS} onChange={(v) => set('type', v)} />
          <Select label="Category" value={form.category ?? ''} options={CATEGORY_OPTIONS} onChange={(v) => set('category', v)} />
          <Input label="Description" value={form.description ?? ''} onChange={(v) => set('description', v)} />
          <Input label="Amount (₹)" value={String(form.amount ?? '')} onChange={(v) => set('amount', parseFloat(v) || 0)} type="number" />
          <Input label="Date (dd-MMM-yyyy)" value={form.date ?? ''} onChange={(v) => set('date', v)} />
          <Input label="Receipt #" value={form.receipt ?? ''} onChange={(v) => set('receipt', v)} />
          <Input label="Linked Member ID" value={form.linkedMemberId ?? ''} onChange={(v) => set('linkedMemberId', v)} />
          <Input label="Notes" value={form.notes ?? ''} onChange={(v) => set('notes', v)} />

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            onClick={save}
            disabled={saving}
            className="w-full bg-primary-500 text-white rounded-xl py-3 font-semibold text-sm disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="text-xs text-gray-500">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-primary-300" />
    </div>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-gray-500">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300">
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}
