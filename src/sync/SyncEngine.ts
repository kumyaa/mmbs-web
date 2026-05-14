/**
 * SyncEngine — pull + push + conflict detection.
 * Mirrors Android SyncEngine.kt logic, adapted for Dexie / browser.
 */

import { db } from '../db/db';
import type { MemberEntity, MembershipRowEntity, TransactionEntity } from '../db/schema';
import type { GetToken } from './SheetsClient';
import { batchGet, valuesAppend, valuesUpdate } from './SheetsClient';
import {
  APP_USERS_RANGE,
  MEMBERS_DATA_ROW,
  MEMBERS_RANGE,
  MEMBERSHIP_DATA_ROW,
  MEMBERSHIP_HEADER_ROW,
  MEMBERSHIP_RANGE,
  TRANSACTIONS_DATA_ROW,
  TRANSACTIONS_RANGE,
  detectFyColumns,
  fyUpdateRange,
  fyUpdateRow,
  memberToSheetRow,
  sheetRowToAppUser,
  transactionToSheetRow,
  sheetRowToMember,
  sheetRowToMembershipRow,
  sheetRowToTransaction,
  type FyColumnGroup,
} from './RowMapper';
import type { ConflictItem } from './ConflictStore';

// ── Sync state ─────────────────────────────────────────────────────────────

export type SyncPhase =
  | 'idle'
  | 'pulling'
  | 'pushing'
  | 'conflict'
  | 'done'
  | 'error';

export interface SyncProgress {
  phase: SyncPhase;
  message: string;
  lastSyncAt?: number;
}

export type ProgressCallback = (p: SyncProgress) => void;
type ConflictCallback = (c: ConflictItem) => void;

// ── Detected FY columns ─────────────────────────────────────────────────────

let _detectedFyGroups: FyColumnGroup[] = [];

export function getDetectedFyGroups(): FyColumnGroup[] {
  return _detectedFyGroups;
}

// ── Full pull ──────────────────────────────────────────────────────────────

export async function fullPull(
  spreadsheetId: string,
  getToken: GetToken,
  onProgress: ProgressCallback,
  onConflict: ConflictCallback,
  sheetModifiedTime?: number,
): Promise<void> {
  onProgress({ phase: 'pulling', message: 'Reading spreadsheet…' });

  // Fetch each sheet separately so a wrong tab name on one sheet
  // doesn't abort the entire sync. Errors are logged and warned.
  const fetchSheet = async (range: string): Promise<string[][]> => {
    try {
      const { valueRanges } = await batchGet(spreadsheetId, [range], getToken);
      return valueRanges[0]?.values ?? [];
    } catch (e) {
      const tabName = range.split('!')[0];
      console.warn(`[SyncEngine] Failed to fetch "${tabName}":`, e);
      onProgress({
        phase: 'pulling',
        message: `⚠ Could not read sheet tab "${tabName}" — check exact tab name in the spreadsheet`,
      });
      // Small pause so the user can see the warning
      await new Promise((r) => setTimeout(r, 1200));
      return [];
    }
  };

  const membersRows    = await fetchSheet(MEMBERS_RANGE);
  const membershipRows = await fetchSheet(MEMBERSHIP_RANGE);
  const txnsRows       = await fetchSheet(TRANSACTIONS_RANGE);
  const usersRows      = await fetchSheet(APP_USERS_RANGE);

  console.log('[SyncEngine] Raw row counts — Members:', membersRows.length,
    '| Membership:', membershipRows.length,
    '| Transactions:', txnsRows.length,
    '| AppUsers:', usersRows.length);
  if (membersRows.length > 0) {
    console.log('[SyncEngine] Members first 3 rows:', JSON.stringify(membersRows.slice(0, 3)));
  }

  // ── AppUsers ───────────────────────────────────────────────────────────
  onProgress({ phase: 'pulling', message: 'Syncing users…' });
  await db.appUsers.clear();
  for (let i = 1; i < usersRows.length; i++) {
    const row = usersRows[i];
    if (!row[0]) continue;
    await db.appUsers.put(sheetRowToAppUser(row));
  }

  // ── Members ────────────────────────────────────────────────────────────
  onProgress({ phase: 'pulling', message: `Syncing members… (${membersRows.length} rows in sheet)` });
  let membersSaved = 0;
  for (let i = MEMBERS_DATA_ROW - 1; i < membersRows.length; i++) {
    const row = membersRows[i];
    const sheetRowIndex = i + 1; // 1-based
    const memberId = row[0]?.trim();
    if (!memberId) continue;
    // Skip header/label rows (e.g. "Member ID", "MEMBER REGISTER")
    if (memberId.toLowerCase().includes('member') || memberId.toLowerCase() === 'id') continue;

    const incoming = sheetRowToMember(row, sheetRowIndex, sheetModifiedTime);
    const existing = await db.members.get(memberId);

    if (!existing) {
      await db.members.put(incoming);
      membersSaved++;
      continue;
    }

    // Conflict detection: both sides changed
    if (
      existing.syncStatus === 'PENDING' &&
      existing.lastLocalModifiedAt > (existing.lastSheetModifiedTime ?? 0) &&
      hasChanged(existing, incoming)
    ) {
      const conflictFields = diffFields(existing, incoming, [
        'primaryName', 'primaryMobile', 'email', 'address',
        'firstYear', 'status', 'notes',
      ]);
      if (conflictFields.length > 0) {
        onConflict({
          id: memberId,
          table: 'members',
          fields: conflictFields,
          resolve: async (decisions) => {
            const merged = { ...existing } as unknown as Record<string, unknown>;
            for (const [field, choice] of Object.entries(decisions)) {
              if (choice === 'sheet') {
                merged[field] = (incoming as unknown as Record<string, unknown>)[field];
              }
            }
            (merged as unknown as MemberEntity).syncStatus = 'PENDING';
            await db.members.put(merged as unknown as MemberEntity);
          },
        });
        continue;
      }
    }

    // No conflict — update from sheet (preserve local edits if PENDING)
    if (existing.syncStatus !== 'PENDING') {
      await db.members.put(incoming);
      membersSaved++;
    } else {
      // Update sheet row index even if local changes are pending
      await db.members.update(memberId, { sheetRowIndex });
    }
  }
  console.log(`[SyncEngine] Members saved/updated: ${membersSaved}`);
  onProgress({ phase: 'pulling', message: `Syncing members… ${membersSaved} loaded` });

  // ── Membership Tracker ─────────────────────────────────────────────────
  onProgress({ phase: 'pulling', message: 'Syncing membership fees…' });
  if (membershipRows.length >= MEMBERSHIP_HEADER_ROW) {
    const headerRow = membershipRows[MEMBERSHIP_HEADER_ROW - 1] ?? [];
    _detectedFyGroups = detectFyColumns(headerRow);

    // Persist detected labels
    const labels = _detectedFyGroups.map((g) => g.shortLabel).join(',');
    await db.configKv.put({ key: 'knownFyLabels', value: labels });

    for (let i = MEMBERSHIP_DATA_ROW - 1; i < membershipRows.length; i++) {
      const row = membershipRows[i];
      const memberId = row[0]?.trim();
      if (!memberId) continue;

      const incoming = sheetRowToMembershipRow(
        row, _detectedFyGroups, i + 1, sheetModifiedTime,
      );
      const existing = await db.membershipRows.get(memberId);

      if (!existing || existing.syncStatus !== 'PENDING') {
        await db.membershipRows.put(incoming);
      } else {
        await db.membershipRows.update(memberId, { sheetRowIndex: i + 1 });
      }
    }
  }

  // ── Transactions ───────────────────────────────────────────────────────
  onProgress({ phase: 'pulling', message: 'Syncing transactions…' });
  for (let i = TRANSACTIONS_DATA_ROW - 1; i < txnsRows.length; i++) {
    const row = txnsRows[i];
    const txnId = row[1]?.trim();
    if (!txnId) continue;

    const incoming = sheetRowToTransaction(row, i + 1, sheetModifiedTime);
    const existing = await db.transactions.get(txnId);

    if (!existing || existing.syncStatus !== 'PENDING') {
      await db.transactions.put(incoming);
    } else {
      await db.transactions.update(txnId, { sheetRowIndex: i + 1 });
    }
  }

  // Record last sync time
  await db.configKv.put({ key: 'lastSyncAt', value: String(Date.now()) });
  onProgress({ phase: 'done', message: 'Sync complete.', lastSyncAt: Date.now() });
}

// ── Push pending rows ──────────────────────────────────────────────────────

export async function pushPending(
  spreadsheetId: string,
  getToken: GetToken,
  onProgress: ProgressCallback,
): Promise<void> {
  const pendingMembers = await db.members
    .where('syncStatus').equals('PENDING').toArray();
  const pendingMembership = await db.membershipRows
    .where('syncStatus').equals('PENDING').toArray();
  const pendingTxns = await db.transactions
    .where('syncStatus').equals('PENDING').toArray();

  if (
    pendingMembers.length === 0 &&
    pendingMembership.length === 0 &&
    pendingTxns.length === 0
  ) {
    return;
  }

  onProgress({ phase: 'pushing', message: 'Saving to spreadsheet…' });

  // Push members
  for (const m of pendingMembers) {
    try {
      const rowData = [memberToSheetRow(m as MemberEntity)];
      if (m.sheetRowIndex) {
        const range = `Members!A${m.sheetRowIndex}:X${m.sheetRowIndex}`;
        await valuesUpdate(spreadsheetId, range, rowData, getToken);
      } else {
        const { updatedRange } = await valuesAppend(
          spreadsheetId, 'Members!A:X', rowData, getToken,
        );
        // Parse the updated range to get the new row index
        const rowNum = parseRangeRowNumber(updatedRange);
        await db.members.update((m as MemberEntity).memberId, {
          sheetRowIndex: rowNum ?? undefined,
        });
      }
      await db.members.update((m as MemberEntity).memberId, { syncStatus: 'SYNCED', pushError: undefined });
    } catch (err) {
      await db.members.update((m as MemberEntity).memberId, {
        syncStatus: 'FAILED',
        pushError: String(err),
      });
    }
  }

  // Push membership rows (individual FY cell updates)
  for (const mr of pendingMembership) {
    try {
      const mr_ = mr as MembershipRowEntity;
      const feesMap = JSON.parse(mr_.feesJson ?? '{}') as Record<string, { status: string; amount: string; date: string; receipt: string }>;
      if (!mr_.sheetRowIndex) continue; // can't push without a row index

      for (const g of _detectedFyGroups) {
        const cell = feesMap[g.shortLabel];
        if (!cell) continue;
        const range = fyUpdateRange(mr_.sheetRowIndex, g);
        await valuesUpdate(spreadsheetId, range, [fyUpdateRow(cell)], getToken);
      }
      await db.membershipRows.update(mr_.memberId, { syncStatus: 'SYNCED', pushError: undefined });
    } catch (err) {
      await db.membershipRows.update((mr as MembershipRowEntity).memberId, {
        syncStatus: 'FAILED',
        pushError: String(err),
      });
    }
  }

  // Push transactions
  for (const t of pendingTxns) {
    try {
      const rowData = [transactionToSheetRow(t as TransactionEntity)];
      if (t.sheetRowIndex) {
        const range = `Transactions!A${t.sheetRowIndex}:J${t.sheetRowIndex}`;
        await valuesUpdate(spreadsheetId, range, rowData, getToken);
      } else {
        const { updatedRange } = await valuesAppend(
          spreadsheetId, 'Transactions!A:J', rowData, getToken,
        );
        const rowNum = parseRangeRowNumber(updatedRange);
        await db.transactions.update((t as TransactionEntity).txnId, {
          sheetRowIndex: rowNum ?? undefined,
        });
      }
      await db.transactions.update((t as TransactionEntity).txnId, { syncStatus: 'SYNCED', pushError: undefined });
    } catch (err) {
      await db.transactions.update((t as TransactionEntity).txnId, {
        syncStatus: 'FAILED',
        pushError: String(err),
      });
    }
  }

  onProgress({ phase: 'done', message: 'Changes saved.', lastSyncAt: Date.now() });
}

// ── Internal helpers ───────────────────────────────────────────────────────

function hasChanged(a: MemberEntity, b: MemberEntity): boolean {
  const fields: (keyof MemberEntity)[] = [
    'primaryName', 'primaryMobile', 'email', 'address',
    'firstYear', 'status', 'notes',
    'fm2Name', 'fm2Mobile', 'fm2Rel', 'fm2WaGroup',
    'fm3Name', 'fm3Mobile', 'fm3Rel', 'fm3WaGroup',
    'fm4Name', 'fm4Mobile', 'fm4Rel', 'fm4WaGroup',
  ];
  return fields.some((f) => a[f] !== b[f]);
}

function diffFields(
  local: MemberEntity,
  sheet: MemberEntity,
  fields: string[],
): { field: string; localValue: string; sheetValue: string }[] {
  const localR  = local  as unknown as Record<string, unknown>;
  const sheetR  = sheet  as unknown as Record<string, unknown>;
  return fields
    .filter((f) => localR[f] !== sheetR[f])
    .map((f) => ({
      field: f,
      localValue: String(localR[f] ?? ''),
      sheetValue: String(sheetR[f] ?? ''),
    }));
}

/** Parse "Members!A5:X5" → 5. Returns null on failure. */
function parseRangeRowNumber(range: string): number | null {
  const m = range.match(/!.*?(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}
