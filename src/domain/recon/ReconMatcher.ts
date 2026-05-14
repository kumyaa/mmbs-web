/**
 * ReconMatcher — TypeScript port of recon_engine/matcher.py.
 *
 * Two-pass greedy matching:
 *  Pass 1 — Reference number match (HIGH confidence)
 *  Pass 2 — Amount + date ±2 days (MEDIUM confidence)
 *
 * 1:1 matching: a bank row matches at most one app transaction and vice-versa.
 */

import type { BankTransaction } from './HdfcParser';
import type { TransactionEntity } from '../../db/schema';

// ── Types ──────────────────────────────────────────────────────────────────

export type MatchConfidence = 'HIGH' | 'MEDIUM' | 'NONE';

export interface MatchResult {
  bankRow: BankTransaction;
  appTxn: TransactionEntity | null;
  confidence: MatchConfidence;
  matchReason: string;
  narrationHints: string[];
  /** Updated by UI — user can force-link or exclude */
  overrideStatus?: 'MANUAL' | 'EXCLUDED';
}

export interface ReconciliationResult {
  matches: MatchResult[];
  unmatchedBankRows: BankTransaction[];
  unmatchedAppTxns: TransactionEntity[];
  openingBalance: number;
  bankClosingBalance: number;
  appClosingBalance: number;
}

// ── Hint extraction ────────────────────────────────────────────────────────

const HINT_PATTERNS: [RegExp, string][] = [
  [/\bMEMBERSHIP\b/i,   'membership payment'],
  [/\bRENEWAL\b/i,      'renewal'],
  [/\bMMBS\b/i,         'MMBS reference'],
  [/\bREGISTRATION\b/i, 'registration'],
  [/\bSPONSOR\b/i,      'sponsorship'],
  [/\bDONATION\b/i,     'donation'],
];

function extractHints(narration: string): string[] {
  const hints: string[] = [];
  for (const [re, label] of HINT_PATTERNS) {
    if (re.test(narration)) hints.push(label);
  }

  // UPI sender name
  const parts = narration.toUpperCase().split('-');
  if (parts.length >= 3 && parts[0] === 'UPI') {
    for (const seg of parts.slice(1, 4)) {
      const s = seg.trim();
      if (/^[A-Z][A-Z ]{4,}$/.test(s) && !s.includes('@') && !/\d/.test(s)) {
        hints.push(`sender: ${s.replace(/\b\w/g, (c) => c + c.slice(1).toLowerCase()).trim()}`);
        break;
      }
    }
  }

  // IMPS sender name
  const impsM = narration.toUpperCase().match(/^IMPS-\d+-([A-Z][A-Z ]{3,30})-/);
  if (impsM) {
    hints.push(`sender: ${impsM[1].trim()}`);
  }

  return hints;
}

// ── Matching helpers ───────────────────────────────────────────────────────

const DATE_WINDOW_DAYS = 2;

function refsMatch(bankRef: string, appRef: string): boolean {
  const b = bankRef.trim().replace(/^0+/, '');
  const a = appRef.trim().replace(/^0+/, '');
  return !!(b && a && b === a);
}

function amountsMatch(bank: BankTransaction, app: TransactionEntity): boolean {
  if (bank.deposit !== null && app.type === 'Income') {
    return Math.abs(bank.deposit - app.amount) < 0.01;
  }
  if (bank.withdrawal !== null && app.type === 'Expense') {
    return Math.abs(bank.withdrawal - app.amount) < 0.01;
  }
  return false;
}

function parseTxnDate(s: string): Date | null {
  // "dd-MMM-yyyy"
  const months: Record<string, number> = {
    Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,
    Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11,
  };
  const m = s.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const mm = months[m[2]];
  if (mm === undefined) return null;
  return new Date(parseInt(m[3], 10), mm, parseInt(m[1], 10));
}

function withinDateWindow(bankDate: Date, appDateStr: string): boolean {
  const appDate = parseTxnDate(appDateStr);
  if (!appDate) return false;
  const diff = Math.abs(bankDate.getTime() - appDate.getTime());
  return diff <= DATE_WINDOW_DAYS * 86_400_000;
}

function dateDelta(bankDate: Date, appDateStr: string): number {
  const appDate = parseTxnDate(appDateStr);
  if (!appDate) return 9999;
  return Math.abs(Math.round((bankDate.getTime() - appDate.getTime()) / 86_400_000));
}

// ── Core engine ────────────────────────────────────────────────────────────

export function reconcile(
  bankTxns: BankTransaction[],
  appTxns: TransactionEntity[],
  openingBalance = 0,
  bankClosing = 0,
  appClosing = 0,
): ReconciliationResult {
  // Only match unreconciled app transactions
  const available = new Map(
    appTxns.filter((t) => t.txnId !== 'TXN-0000').map((t) => [t.txnId, t]),
  );

  const results: MatchResult[] = [];
  const consumedBank = new Set<number>(); // rowIndex
  const consumedApp  = new Set<string>(); // txnId

  // ── Pass 1: Reference match (HIGH) ─────────────────────────────────────
  for (const btxn of bankTxns) {
    if (!btxn.reference) continue;
    for (const [txnId, atxn] of available) {
      if (consumedApp.has(txnId)) continue;
      if (refsMatch(btxn.reference, atxn.receipt) && amountsMatch(btxn, atxn)) {
        results.push({
          bankRow: btxn,
          appTxn: atxn,
          confidence: 'HIGH',
          matchReason: `Reference match (${btxn.reference})`,
          narrationHints: extractHints(btxn.narration),
        });
        consumedBank.add(btxn.rowIndex);
        consumedApp.add(txnId);
        break;
      }
    }
  }

  // ── Pass 2: Amount + date window (MEDIUM) ──────────────────────────────
  for (const btxn of bankTxns) {
    if (consumedBank.has(btxn.rowIndex)) continue;

    const candidates: [number, string, TransactionEntity][] = [];
    for (const [txnId, atxn] of available) {
      if (consumedApp.has(txnId)) continue;
      if (amountsMatch(btxn, atxn) && withinDateWindow(btxn.valueDate, atxn.date)) {
        candidates.push([dateDelta(btxn.valueDate, atxn.date), txnId, atxn]);
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
      const [delta, bestId, bestTxn] = candidates[0];
      results.push({
        bankRow: btxn,
        appTxn: bestTxn,
        confidence: 'MEDIUM',
        matchReason: `Amount ₹${Math.abs(btxn.amount).toFixed(0)} + date ±${delta}d`,
        narrationHints: extractHints(btxn.narration),
      });
      consumedBank.add(btxn.rowIndex);
      consumedApp.add(bestId);
    } else {
      results.push({
        bankRow: btxn,
        appTxn: null,
        confidence: 'NONE',
        matchReason: 'No matching app transaction found',
        narrationHints: extractHints(btxn.narration),
      });
    }
  }

  const unmatchedBankRows = bankTxns.filter((b) => !consumedBank.has(b.rowIndex));
  const unmatchedAppTxns  = [...available.values()].filter((a) => !consumedApp.has(a.txnId));

  return {
    matches: results,
    unmatchedBankRows,
    unmatchedAppTxns,
    openingBalance,
    bankClosingBalance: bankClosing,
    appClosingBalance: appClosing,
  };
}
