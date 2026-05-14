/**
 * Dexie schema — mirrors the Android Room entities exactly.
 * Every synced table carries the same 5 sync-metadata columns.
 */

export type SyncStatus = 'SYNCED' | 'PENDING' | 'FAILED';

interface SyncMeta {
  sheetRowIndex?: number;   // 1-based row in the sheet; undefined = locally new
  syncStatus: SyncStatus;
  lastLocalModifiedAt: number;  // epoch ms
  lastSheetModifiedTime?: number;
  pushError?: string;
}

// ── Members ────────────────────────────────────────────────────────────────

export interface MemberEntity extends SyncMeta {
  memberId: string;           // PK, e.g. "MM-0170"
  regDate: string;            // "dd-MMM-yyyy"
  primaryName: string;
  primaryMobile: string;
  email: string;
  fm2Name: string; fm2Rel: string; fm2Mobile: string; fm2WaGroup: string;
  fm3Name: string; fm3Rel: string; fm3Mobile: string; fm3WaGroup: string;
  fm4Name: string; fm4Rel: string; fm4Mobile: string; fm4WaGroup: string;
  address: string;
  firstYear: string;          // "2025-26" (YYYY-YY, no "FY" prefix)
  status: string;             // "Active" | "Inactive" | "Suspended"
  totalFamilyMembers: string;
  waGroupCount: string;
  waValidation: string;
  notes: string;
}

// ── Membership rows (one row per member; FY cells stored as JSON map) ──────

export interface FyCell {
  status: string;    // "New" | "Renewed" | "Unpaid" | "Lapsed"
  amount: string;
  date: string;
  receipt: string;
}

export interface MembershipRowEntity extends SyncMeta {
  memberId: string;           // FK → members.memberId (also local PK)
  feesJson: string;           // JSON.stringify(Map<fyLabel, FyCell>)
}

// ── Transactions ───────────────────────────────────────────────────────────

export interface TransactionEntity extends SyncMeta {
  txnId: string;              // PK, e.g. "TXN-0001"
  date: string;               // "dd-MMM-yyyy"
  type: string;               // "Income" | "Expense"
  category: string;
  description: string;
  amount: number;
  runningBalance: number;
  linkedMemberId: string;
  receipt: string;
  notes: string;
}

// ── Bank reconciliation rows ───────────────────────────────────────────────

export interface BankReconEntity extends SyncMeta {
  bankDate: string;
  bankNarration: string;
  bankRef: string;
  bankAmount: number;
  bankType: string;           // "CR" | "DR"
  matchedTxnId: string;
  reconStatus: string;        // "Matched" | "Unmatched" | "Excluded"
  notes: string;
}

// ── Config key-value ───────────────────────────────────────────────────────

export interface ConfigKvEntity {
  key: string;                // PK
  value: string;
}

// ── App users ──────────────────────────────────────────────────────────────

export interface AppUserEntity {
  email: string;              // PK
  role: string;               // "Treasurer" | "Committee Member" | "Auditor"
}
