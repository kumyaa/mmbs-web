import type { SyncStatus } from '../db/schema';

interface Props {
  status: SyncStatus;
  error?: string;
}

export function SyncIcon({ status, error }: Props) {
  if (status === 'SYNCED') return null;

  const cls =
    status === 'PENDING'
      ? 'bg-amber-400'
      : 'bg-red-500';

  const title =
    status === 'PENDING'
      ? 'Pending sync'
      : `Sync failed: ${error ?? 'unknown error'}`;

  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${cls} flex-shrink-0`}
      title={title}
    />
  );
}
