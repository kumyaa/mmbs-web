/**
 * RunningBalance — recompute the running balance chain for transactions.
 * Mirrors Android RunningBalance.kt.
 *
 * When a transaction is inserted, edited, or deleted:
 * 1. Load ALL transactions ordered by date, then txnId (for same-day stability).
 * 2. Walk the sorted list, carrying forward the running total.
 * 3. Return the updated list so the caller can bulk-put to Dexie + push to sheet.
 */

import { db } from '../db/db';
import type { TransactionEntity } from '../db/schema';

/** Sort key for transactions: date string "dd-MMM-yyyy" lexicographic is wrong —
 *  convert to epoch for proper ordering. */
function txnSortKey(t: TransactionEntity): number {
  // Parse "dd-MMM-yyyy"
  const d = parseDmyDate(t.date);
  // Tie-break by numeric txnId suffix
  const n = parseInt(t.txnId.replace(/^TXN-/, ''), 10) || 0;
  return d * 10000 + n;
}

function parseDmyDate(s: string): number {
  try {
    const [dd, mon, yyyy] = s.split('-');
    const months: Record<string, number> = {
      Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,
      Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12,
    };
    const m = months[mon] ?? 1;
    return new Date(parseInt(yyyy,10), m-1, parseInt(dd,10)).getTime();
  } catch {
    return 0;
  }
}

/** Opening balance row ID (read-only, never edited). */
export const OPENING_BALANCE_ID = 'TXN-0000';

/**
 * Recompute running balances for ALL transactions.
 * Marks every affected row as PENDING.
 * Returns the updated list — call `db.transactions.bulkPut(result)` after.
 */
export async function recomputeAll(): Promise<TransactionEntity[]> {
  const all = await db.transactions.toArray();
  all.sort((a, b) => txnSortKey(a) - txnSortKey(b));

  let running = 0;

  // Find opening balance row first
  const openingRow = all.find((t) => t.txnId === OPENING_BALANCE_ID);
  if (openingRow) {
    running = openingRow.amount; // opening balance is stored as the amount
  }

  const updated: TransactionEntity[] = [];

  for (const t of all) {
    if (t.txnId === OPENING_BALANCE_ID) {
      updated.push({ ...t, runningBalance: t.amount, syncStatus: 'SYNCED' });
      continue;
    }

    if (t.type === 'Income') {
      running += t.amount;
    } else {
      running -= t.amount;
    }

    const newBalance = Math.round(running * 100) / 100;
    const changed = Math.abs(t.runningBalance - newBalance) > 0.001;

    updated.push({
      ...t,
      runningBalance: newBalance,
      syncStatus: changed ? 'PENDING' : t.syncStatus,
      lastLocalModifiedAt: changed ? Date.now() : t.lastLocalModifiedAt,
    });
  }

  return updated;
}

/**
 * Save a transaction and recompute the full running balance chain.
 * Call after any insert / edit / delete.
 */
export async function saveAndRecompute(txn: TransactionEntity): Promise<void> {
  await db.transactions.put({
    ...txn,
    syncStatus: 'PENDING',
    lastLocalModifiedAt: Date.now(),
  });
  const updated = await recomputeAll();
  await db.transactions.bulkPut(updated);
}

/**
 * Delete a transaction and recompute the full chain.
 */
export async function deleteAndRecompute(txnId: string): Promise<void> {
  await db.transactions.delete(txnId);
  const updated = await recomputeAll();
  await db.transactions.bulkPut(updated);
}

/** Auto-generate the next TXN-XXXX id. */
export async function nextTxnId(): Promise<string> {
  const all = await db.transactions.toArray();
  const nums = all
    .map((t) => parseInt(t.txnId.replace(/^TXN-/, ''), 10))
    .filter((n) => !isNaN(n));
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `TXN-${String(max + 1).padStart(4, '0')}`;
}
