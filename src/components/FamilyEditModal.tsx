/**
 * Family member edit modal — web port of Android FamilyEditDialogFragment.
 * Handles slot 2, 3, or 4 (fm2, fm3, fm4).
 */
import { useState } from 'react';

export const RELATIONS = [
  'Spouse', 'Son', 'Daughter', 'Father', 'Mother',
  'Father in Law', 'Mother in Law',
];

export interface FamilySlot {
  slot: 2 | 3 | 4;
  name: string;
  relation: string;
  mobile: string;
  waGroup: string; // "Yes" | "No" | ""
}

interface Props {
  slot: FamilySlot;
  onSave: (updated: FamilySlot) => void;
  onClear: (slot: 2 | 3 | 4) => void;
  onClose: () => void;
}

export function FamilyEditModal({ slot, onSave, onClear, onClose }: Props) {
  const [name, setName]       = useState(slot.name);
  const [relation, setRelation] = useState(slot.relation);
  const [mobile, setMobile]   = useState(slot.mobile);
  const [waGroup, setWaGroup] = useState(slot.waGroup || 'No');

  // Prepend unknown legacy values
  const relOptions = relation && !RELATIONS.includes(relation)
    ? [relation, ...RELATIONS]
    : RELATIONS;

  const save = () => {
    if (!name.trim()) return;
    onSave({ slot: slot.slot, name: name.trim(), relation, mobile: mobile.trim(), waGroup });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5">
        <h2 className="text-base font-bold text-gray-800 mb-4">
          Family Member {slot.slot}
        </h2>

        <div className="space-y-3">
          <Field label="Name *" value={name} onChange={setName} />

          <div>
            <label className="text-xs text-gray-500">Relation</label>
            <select
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1 bg-white"
            >
              <option value="">— Select —</option>
              {relOptions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <Field label="Mobile" value={mobile} onChange={setMobile} type="tel" />

          <div>
            <label className="text-xs text-gray-500">In WhatsApp Group?</label>
            <div className="flex gap-3 mt-1">
              {['Yes', 'No'].map((opt) => (
                <button
                  key={opt}
                  onClick={() => setWaGroup(opt)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium ${
                    waGroup === opt
                      ? 'bg-primary-500 text-white border-primary-500'
                      : 'border-gray-200 text-gray-600'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm text-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={() => { onClear(slot.slot); onClose(); }}
            className="flex-1 border border-red-300 rounded-lg py-2.5 text-sm text-red-600"
          >
            Clear
          </button>
          <button
            onClick={save}
            disabled={!name.trim()}
            className="flex-1 bg-primary-500 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, type = 'text',
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label className="text-xs text-gray-500">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-primary-300"
      />
    </div>
  );
}
