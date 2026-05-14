/**
 * S-09 — Add / Edit Member.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../db/db';
import type { MemberEntity } from '../db/schema';
import { useAuth } from '../auth/AuthContext';
import { memberStore } from '../store/memberStore';
import { PushQueue } from '../sync/PushQueue';
import { buildFyOptions, currentFyLabel } from '../domain/FinancialYear';
import { format } from 'date-fns';

const STATUS_OPTIONS = ['Active', 'Inactive', 'Suspended'];
const RELATIONS = ['Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Father in Law', 'Mother in Law'];

export function MemberEdit() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { getToken, spreadsheetId } = useAuth();
  const isNew = !id;

  const [form, setForm] = useState<Partial<MemberEntity>>({
    status: 'Active',
    firstYear: currentFyLabel(),
    regDate: format(new Date(), 'dd-MMM-yyyy'),
    fm2Name: '', fm2Rel: '', fm2Mobile: '', fm2WaGroup: '',
    fm3Name: '', fm3Rel: '', fm3Mobile: '', fm3WaGroup: '',
    fm4Name: '', fm4Rel: '', fm4Mobile: '', fm4WaGroup: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fyOptions = buildFyOptions();

  useEffect(() => {
    if (!id) return;
    db.members.get(id).then((m) => {
      if (m) setForm(m);
    });
  }, [id]);

  const set = (k: keyof MemberEntity, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.primaryName?.trim()) { setError('Name is required.'); return; }
    if (!form.primaryMobile?.trim()) { setError('Mobile is required.'); return; }
    setError(null);
    setSaving(true);

    try {
      let entity: MemberEntity;
      if (isNew) {
        const memberId = await memberStore.nextMemberId();
        entity = { ...(memberStore.newTemplate()), ...form, memberId } as MemberEntity;
      } else {
        const existing = await db.members.get(id!);
        if (!existing) throw new Error('Member not found.');
        entity = { ...existing, ...form } as MemberEntity;
      }
      await memberStore.saveLocalEdit(entity);
      if (spreadsheetId) {
        PushQueue.schedule(spreadsheetId, getToken, () => {});
      }
      navigate(isNew ? '/members' : `/members/${entity.memberId}`, { replace: true });
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-primary-500 text-white px-4 pt-12 pb-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-white/80 p-1">←</button>
        <h1 className="text-lg font-bold">{isNew ? 'Add Member' : 'Edit Member'}</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <FormCard title="Primary Member">
          <Field label="Full Name *" value={form.primaryName ?? ''} onChange={(v) => set('primaryName', v)} />
          <Field label="Mobile *" value={form.primaryMobile ?? ''} onChange={(v) => set('primaryMobile', v)} type="tel" />
          <Field label="Email" value={form.email ?? ''} onChange={(v) => set('email', v)} type="email" />
          <Field label="Address" value={form.address ?? ''} onChange={(v) => set('address', v)} multiline />
          <SelectField label="Status" value={form.status ?? 'Active'} options={STATUS_OPTIONS} onChange={(v) => set('status', v)} />
          <SelectField label="First Year" value={form.firstYear ?? ''} options={fyOptions} onChange={(v) => set('firstYear', v)} />
        </FormCard>

        {[
          { label: 'Family Member 2', prefix: 'fm2' },
          { label: 'Family Member 3', prefix: 'fm3' },
          { label: 'Family Member 4', prefix: 'fm4' },
        ].map(({ label, prefix }) => {
          const nameKey = `${prefix}Name` as keyof MemberEntity;
          const relKey  = `${prefix}Rel`  as keyof MemberEntity;
          const mobKey  = `${prefix}Mobile` as keyof MemberEntity;
          const waKey   = `${prefix}WaGroup` as keyof MemberEntity;
          return (
            <FormCard key={prefix} title={label}>
              <Field label="Name" value={(form[nameKey] as string) ?? ''} onChange={(v) => set(nameKey, v)} />
              <SelectField label="Relation" value={(form[relKey] as string) ?? ''} options={['', ...RELATIONS]} onChange={(v) => set(relKey, v)} />
              <Field label="Mobile" value={(form[mobKey] as string) ?? ''} onChange={(v) => set(mobKey, v)} type="tel" />
              <SelectField label="In WA Group?" value={(form[waKey] as string) ?? ''} options={['', 'Yes', 'No']} onChange={(v) => set(waKey, v)} />
            </FormCard>
          );
        })}

        <FormCard title="Notes">
          <Field label="" value={form.notes ?? ''} onChange={(v) => set('notes', v)} multiline />
        </FormCard>

        {error && <p className="text-sm text-red-600 px-1">{error}</p>}

        <button
          onClick={save}
          disabled={saving}
          className="w-full bg-primary-500 text-white rounded-xl py-3 font-semibold text-sm shadow-sm disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <div className="h-8" />
      </div>
    </div>
  );
}

function FormCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Field({
  label, value, onChange, type = 'text', multiline = false,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; multiline?: boolean;
}) {
  const cls =
    'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 mt-1';
  return (
    <div className="mb-3">
      {label && <label className="text-xs text-gray-500">{label}</label>}
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
          rows={2}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
        />
      )}
    </div>
  );
}

function SelectField({
  label, value, options, onChange,
}: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  // If current value not in options, prepend it
  const opts = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <div className="mb-3">
      {label && <label className="text-xs text-gray-500">{label}</label>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 mt-1 bg-white"
      >
        {opts.map((o) => <option key={o} value={o}>{o || '— Select —'}</option>)}
      </select>
    </div>
  );
}
