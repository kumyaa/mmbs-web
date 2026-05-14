/**
 * RowMapper — translates between Google Sheets row arrays and Dexie entities.
 * Mirrors Android RowMapper.kt column-for-column.
 *
 * Sheet data-start rows (1-based):
 *   Members sheet        → row 4  (rows 1-3 are title / headers / sub-headers)
 *   Membership Tracker   → row 4
 *   Transactions         → row 4
 *   AppUsers             → row 2
 *
 * Column indices below are 0-based (matching Sheets API ROWS output).
 */

import type {
  AppUserEntity,
  FyCell,
  MemberEntity,
  MembershipRowEntity,
  TransactionEntity,
} from '../db/schema';

// ── helpers ────────────────────────────────────────────────────────────────

function col(row: string[], i: number): string {
  return (row[i] ?? '').trim();
}

function num(row: string[], i: number): number {
  return parseFloat(col(row, i).replace(/,/g, '')) || 0;
}

// ── Members (sheet "Members", data from row 4) ─────────────────────────────
// Column map (actual sheet — verified from console log):
// A=0  MemberId    B=1  RegDate     C=2  PrimaryName   D=3  PrimaryMobile
// E=4  Email       F=5  Fm2Name     G=6  Fm2Rel        H=7  Fm2Mobile
// I=8  Fm2WaGroup  J=9  Fm3Name     K=10 Fm3Rel        L=11 Fm3Mobile
// M=12 Fm3WaGroup  N=13 Fm4Name     O=14 Fm4Rel        P=15 Fm4Mobile
// Q=16 Fm4WaGroup  R=17 Address     S=18 FirstYear      T=19 Status
// U=20 TotalFamilyMembers  V=21 WaGroupCount  W=22 WaValidation  X=23 Notes

export const MEMBERS_RANGE = 'Members!A:X';
export const MEMBERS_DATA_ROW = 4; // 1-based

export function sheetRowToMember(
  row: string[],
  sheetRowIndex: number,
  lastSheetModifiedTime?: number,
): MemberEntity {
  return {
    memberId:          col(row, 0),
    regDate:           col(row, 1),
    primaryName:       col(row, 2),
    primaryMobile:     col(row, 3),
    email:             col(row, 4),
    fm2Name:           col(row, 5),  fm2Rel: col(row, 6),
    fm2Mobile:         col(row, 7),  fm2WaGroup: col(row, 8),
    fm3Name:           col(row, 9),  fm3Rel: col(row, 10),
    fm3Mobile:         col(row, 11), fm3WaGroup: col(row, 12),
    fm4Name:           col(row, 13), fm4Rel: col(row, 14),
    fm4Mobile:         col(row, 15), fm4WaGroup: col(row, 16),
    address:           col(row, 17),
    firstYear:         col(row, 18),
    status:            col(row, 19),
    totalFamilyMembers: col(row, 20),
    waGroupCount:      col(row, 21),
    waValidation:      col(row, 22),
    notes:             col(row, 23),
    sheetRowIndex,
    syncStatus: 'SYNCED',
    lastLocalModifiedAt: Date.now(),
    lastSheetModifiedTime,
  };
}

export function memberToSheetRow(m: MemberEntity): string[] {
  return [
    m.memberId, m.regDate, m.primaryName, m.primaryMobile, m.email,
    m.fm2Name, m.fm2Rel, m.fm2Mobile, m.fm2WaGroup,
    m.fm3Name, m.fm3Rel, m.fm3Mobile, m.fm3WaGroup,
    m.fm4Name, m.fm4Rel, m.fm4Mobile, m.fm4WaGroup,
    m.address, m.firstYear, m.status,
    m.totalFamilyMembers, m.waGroupCount, m.waValidation, m.notes,
  ];
}

// ── Membership Tracker (sheet "Membership Tracker", data from row 4) ───────
// Row 2 contains FY column group headers: "FY 2019-20", "FY 2020-21", …
// Each group is 4 columns: Status | Amount | Date | Receipt
// Row 3 sub-headers (ignored)
// Row 4+ data: col A = MemberId, then FY groups

export const MEMBERSHIP_RANGE = 'Membership Tracker!A:ZZ';
export const MEMBERSHIP_HEADER_ROW = 2;  // 1-based row with FY labels
export const MEMBERSHIP_DATA_ROW = 4;

export interface FyColumnGroup {
  label: string;    // e.g. "FY 2025-26" (raw from sheet)
  shortLabel: string; // e.g. "2025-26" (strip "FY " prefix)
  colOffset: number; // 0-based index of "Status" col for this FY
}

const FY_HEADER_RE = /^FY\s*(\d{4}-\d{2})$/i;

/** Parse row 2 (0-indexed = row index 1) to detect FY column groups. */
export function detectFyColumns(headerRow: string[]): FyColumnGroup[] {
  const result: FyColumnGroup[] = [];
  for (let i = 1; i < headerRow.length; i++) {
    const m = FY_HEADER_RE.exec(headerRow[i]?.trim() ?? '');
    if (m) {
      result.push({
        label: headerRow[i].trim(),
        shortLabel: m[1],
        colOffset: i,
      });
    }
  }
  return result;
}

export function sheetRowToMembershipRow(
  row: string[],
  fyGroups: FyColumnGroup[],
  sheetRowIndex: number,
  lastSheetModifiedTime?: number,
): MembershipRowEntity {
  const memberId = col(row, 0);
  const feesMap: Record<string, FyCell> = {};
  for (const g of fyGroups) {
    feesMap[g.shortLabel] = {
      status:  col(row, g.colOffset),
      amount:  col(row, g.colOffset + 1),
      date:    col(row, g.colOffset + 2),
      receipt: col(row, g.colOffset + 3),
    };
  }
  return {
    memberId,
    feesJson: JSON.stringify(feesMap),
    sheetRowIndex,
    syncStatus: 'SYNCED',
    lastLocalModifiedAt: Date.now(),
    lastSheetModifiedTime,
  };
}

/**
 * Build the sheet values array for a single FY cell update.
 * Returns a 1-row, 4-column array: [status, amount, date, receipt].
 */
export function fyUpdateRow(cell: FyCell): string[] {
  return [cell.status, cell.amount, cell.date, cell.receipt];
}

/** A1 column letter from 0-based index. Supports A-Z and AA-ZZ. */
export function colLetter(index: number): string {
  if (index < 26) return String.fromCharCode(65 + index);
  return String.fromCharCode(64 + Math.floor(index / 26)) +
         String.fromCharCode(65 + (index % 26));
}

/** Build the A1 range for a FY cell update (e.g. "Membership Tracker!E5:H5"). */
export function fyUpdateRange(
  sheetRowIndex: number,  // 1-based
  fyGroup: FyColumnGroup,
): string {
  const startCol = colLetter(fyGroup.colOffset);
  const endCol   = colLetter(fyGroup.colOffset + 3);
  return `Membership Tracker!${startCol}${sheetRowIndex}:${endCol}${sheetRowIndex}`;
}

// ── Transactions (sheet "Transactions", data from row 4) ───────────────────
// A=0 Date  B=1 TxnId  C=2 Type  D=3 Category  E=4 Description
// F=5 Amount  G=6 RunningBalance  H=7 LinkedMemberId  I=8 Receipt  J=9 Notes

export const TRANSACTIONS_RANGE = 'Transactions!A:J';
export const TRANSACTIONS_DATA_ROW = 4;

export function sheetRowToTransaction(
  row: string[],
  sheetRowIndex: number,
  lastSheetModifiedTime?: number,
): TransactionEntity {
  return {
    txnId:           col(row, 1),
    date:            col(row, 0),
    type:            col(row, 2),
    category:        col(row, 3),
    description:     col(row, 4),
    amount:          num(row, 5),
    runningBalance:  num(row, 6),
    linkedMemberId:  col(row, 7),
    receipt:         col(row, 8),
    notes:           col(row, 9),
    sheetRowIndex,
    syncStatus: 'SYNCED',
    lastLocalModifiedAt: Date.now(),
    lastSheetModifiedTime,
  };
}

export function transactionToSheetRow(t: TransactionEntity): string[] {
  return [
    t.date, t.txnId, t.type, t.category, t.description,
    t.amount.toString(), t.runningBalance.toString(),
    t.linkedMemberId, t.receipt, t.notes,
  ];
}

// ── AppUsers (sheet "AppUsers", data from row 2) ───────────────────────────
// A=0 Email  B=1 Role

export const APP_USERS_RANGE = 'AppUsers!A:B';

export function sheetRowToAppUser(row: string[]): AppUserEntity {
  return { email: col(row, 0), role: col(row, 1) };
}
