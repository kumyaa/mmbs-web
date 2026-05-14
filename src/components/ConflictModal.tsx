import { useState } from 'react';
import type { ConflictItem } from '../sync/ConflictStore';
import { useConflicts } from '../sync/ConflictStore';

interface FieldRowProps {
  field: string;
  localValue: string;
  sheetValue: string;
  choice: 'local' | 'sheet';
  onChoose: (choice: 'local' | 'sheet') => void;
}

function FieldRow({ field, localValue, sheetValue, choice, onChoose }: FieldRowProps) {
  return (
    <div className="border rounded p-2 mb-2 text-sm">
      <div className="font-medium text-gray-700 mb-1 capitalize">
        {field.replace(/([A-Z])/g, ' $1')}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onChoose('local')}
          className={`flex-1 text-left rounded p-1.5 border text-xs ${
            choice === 'local'
              ? 'border-primary-500 bg-primary-50 text-primary-700'
              : 'border-gray-200 text-gray-600'
          }`}
        >
          <div className="font-semibold mb-0.5">App</div>
          {localValue || <em className="text-gray-400">(empty)</em>}
        </button>
        <button
          onClick={() => onChoose('sheet')}
          className={`flex-1 text-left rounded p-1.5 border text-xs ${
            choice === 'sheet'
              ? 'border-blue-500 bg-blue-50 text-blue-700'
              : 'border-gray-200 text-gray-600'
          }`}
        >
          <div className="font-semibold mb-0.5">Sheet</div>
          {sheetValue || <em className="text-gray-400">(empty)</em>}
        </button>
      </div>
    </div>
  );
}

function SingleConflict({
  conflict,
  onResolved,
}: {
  conflict: ConflictItem;
  onResolved: () => void;
}) {
  const [decisions, setDecisions] = useState<Record<string, 'local' | 'sheet'>>(() => {
    const d: Record<string, 'local' | 'sheet'> = {};
    conflict.fields.forEach((f) => (d[f.field] = 'local'));
    return d;
  });

  const resolve = () => {
    conflict.resolve(decisions);
    onResolved();
  };

  return (
    <div>
      <p className="text-sm text-gray-600 mb-3">
        <strong>{conflict.id}</strong> was edited both here and in the sheet. Choose which
        value to keep for each field:
      </p>
      {conflict.fields.map((f) => (
        <FieldRow
          key={f.field}
          field={f.field}
          localValue={f.localValue}
          sheetValue={f.sheetValue}
          choice={decisions[f.field]}
          onChoose={(c) => setDecisions((d) => ({ ...d, [f.field]: c }))}
        />
      ))}
      <button
        onClick={resolve}
        className="mt-3 w-full bg-primary-500 text-white rounded py-2 font-semibold text-sm"
      >
        Save my choices
      </button>
    </div>
  );
}

export function ConflictModal() {
  const { conflicts, removeConflict } = useConflicts();

  if (conflicts.length === 0) return null;

  const first = conflicts[0];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[80vh] overflow-y-auto">
        <h2 className="text-base font-bold text-gray-800 mb-1">Sync conflict</h2>
        <p className="text-xs text-gray-400 mb-4">
          {conflicts.length} conflict{conflicts.length > 1 ? 's' : ''} to resolve
        </p>
        <SingleConflict
          conflict={first}
          onResolved={() => removeConflict(first.id)}
        />
      </div>
    </div>
  );
}
