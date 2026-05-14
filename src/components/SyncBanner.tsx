import { formatDistanceToNow } from 'date-fns';
import type { SyncPhase } from '../sync/SyncEngine';

interface Props {
  phase: SyncPhase;
  message: string;
  lastSyncAt?: number;
  error?: string;
}

export function SyncBanner({ phase, message, lastSyncAt, error }: Props) {
  if (phase === 'idle' && !lastSyncAt) return null;

  let bg = 'bg-blue-50 border-blue-200 text-blue-800';
  if (phase === 'error') bg = 'bg-red-50 border-red-200 text-red-800';
  if (phase === 'done')  bg = 'bg-green-50 border-green-200 text-green-700';

  const label =
    phase === 'done' && lastSyncAt
      ? `Last synced ${formatDistanceToNow(lastSyncAt, { addSuffix: true })}`
      : message;

  return (
    <div className={`text-xs px-3 py-1.5 border-b ${bg} flex items-center gap-2`}>
      {(phase === 'pulling' || phase === 'pushing') && (
        <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      <span>{error ?? label}</span>
    </div>
  );
}
