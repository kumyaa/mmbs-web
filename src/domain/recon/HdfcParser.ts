/**
 * HdfcParser — TypeScript port of recon_engine/hdfc_parser.py.
 *
 * Parses a 2-D string array (from XlsxReader) that represents an
 * HDFC Bank NetBanking statement.
 *
 * Sheet layout (confirmed from real statements):
 *   7 columns A-G: Date | Narration | Chq./Ref.No. | Value Dt |
 *                  Withdrawal Amt. | Deposit Amt. | Closing Balance
 *   Header row: first row where col A == "Date"
 *   Data rows:  header+2 .. first row where col A starts with "****"
 *   Summary block: after the "****" separator
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface BankTransaction {
  rowIndex: number;          // 0-based within data rows
  date: Date;
  valueDate: Date;
  narration: string;
  reference: string;         // leading zeros stripped
  withdrawal: number | null; // null if blank
  deposit: number | null;
  closingBalance: number;
  matched: boolean;
  matchTxnId: string | null;

  // Computed helpers
  readonly amount: number;   // positive = credit, negative = debit
  readonly isCredit: boolean;
  readonly isDebit: boolean;
}

export interface StatementSummary {
  periodFrom: Date | null;
  periodTo: Date | null;
  openingBalance: number;
  totalDebits: number;
  totalCredits: number;
  closingBalance: number;
  debitCount: number;
  creditCount: number;
}

export interface ParsedStatement {
  accountNumber: string | null;
  accountHolder: string | null;
  bankName: string;
  summary: StatementSummary;
  transactions: BankTransaction[];
  /** Cross-check parsed totals vs summary. Returns warning strings. */
  validate(): string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function col(row: string[], i: number): string {
  return (row[i] ?? '').trim();
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  // DD/MM/YY or DD/MM/YYYY
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
  if (!m) return null;
  const dd = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10) - 1;
  let yyyy = parseInt(m[3], 10);
  if (yyyy < 100) yyyy += yyyy >= 50 ? 1900 : 2000;
  const d = new Date(yyyy, mm, dd);
  return isNaN(d.getTime()) ? null : d;
}

function toFloat(s: string): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

function stripRef(s: string): string {
  const stripped = s.replace(/^0+/, '');
  return stripped || s;
}

function makeTxn(
  rowIndex: number,
  date: Date,
  valueDate: Date,
  narration: string,
  reference: string,
  withdrawal: number | null,
  deposit: number | null,
  closingBalance: number,
): BankTransaction {
  return {
    rowIndex,
    date,
    valueDate,
    narration,
    reference,
    withdrawal,
    deposit,
    closingBalance,
    matched: false,
    matchTxnId: null,
    get amount() {
      if (this.deposit !== null) return this.deposit;
      if (this.withdrawal !== null) return -this.withdrawal;
      return 0;
    },
    get isCredit() { return this.deposit !== null; },
    get isDebit()  { return this.withdrawal !== null; },
  };
}

// ── Metadata extraction ────────────────────────────────────────────────────

interface Meta {
  accountNumber?: string;
  accountHolder?: string;
  periodFrom?: Date;
  periodTo?: Date;
}

function extractMetadata(rows: string[][]): Meta {
  const meta: Meta = {};
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const text = rows[i].join(' ');
    {
      const m = text.match(/Account\s*No\s*[:.]\s*(\d{8,})/i);
      if (m) meta.accountNumber = m[1];
    }
    {
      const m = text.match(
        /Statement\s+From\s*[:.]\s*(\d{2}\/\d{2}\/\d{4})\s+To\s*[:.]\s*(\d{2}\/\d{2}\/\d{4})/i,
      );
      if (m) {
        meta.periodFrom = parseDate(m[1]) ?? undefined;
        meta.periodTo   = parseDate(m[2]) ?? undefined;
      }
    }
    if (i === 5 && !meta.accountHolder) {
      const c0 = (rows[i][0] ?? '').trim();
      if (c0 && c0 !== 'nan') {
        meta.accountHolder = c0.replace(/^M\/S\.\s*/i, '').trim();
      }
    }
  }
  return meta;
}

function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < rows.length; i++) {
    if ((rows[i][0] ?? '').trim() === 'Date') return i;
  }
  throw new Error('Could not locate header row (col A == "Date") in statement file.');
}

function findDataEndRow(rows: string[][], headerRow: number): number {
  for (let i = headerRow + 2; i < rows.length; i++) {
    if ((rows[i][0] ?? '').trim().startsWith('****')) return i;
  }
  return rows.length;
}

function parseSummary(rows: string[][], dataEndRow: number, meta: Meta): StatementSummary {
  let opening = 0, totalDebits = 0, totalCredits = 0, closing = 0;
  let debitCount = 0, creditCount = 0;

  for (let i = dataEndRow; i < Math.min(dataEndRow + 15, rows.length); i++) {
    const row = rows[i];
    const c0 = col(row, 0);
    if (/^\d+(\.\d+)?$/.test(c0)) {
      opening      = parseFloat(c0);
      totalDebits  = toFloat(col(row, 4)) ?? 0;
      totalCredits = toFloat(col(row, 5)) ?? 0;
      closing      = toFloat(col(row, 6)) ?? 0;
    }
    if (col(row, 4) === 'Dr Count' && i + 1 < rows.length) {
      const next = rows[i + 1];
      debitCount  = Math.round(toFloat(col(next, 4)) ?? 0);
      creditCount = Math.round(toFloat(col(next, 5)) ?? 0);
    }
  }

  return {
    periodFrom:     meta.periodFrom ?? null,
    periodTo:       meta.periodTo ?? null,
    openingBalance: opening,
    totalDebits,
    totalCredits,
    closingBalance: closing,
    debitCount,
    creditCount,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Parse HDFC statement rows (from XlsxReader.readXlsx).
 * Throws if the header row cannot be found.
 */
export function parseHdfcStatement(rows: string[][]): ParsedStatement {
  const meta       = extractMetadata(rows);
  const headerRow  = findHeaderRow(rows);
  const dataEndRow = findDataEndRow(rows, headerRow);
  const summary    = parseSummary(rows, dataEndRow, meta);

  const transactions: BankTransaction[] = [];
  let idx = 0;

  for (let i = headerRow + 2; i < dataEndRow; i++) {
    const row = rows[i];
    const rawDate = col(row, 0);
    if (rawDate.startsWith('****') || !rawDate) continue;

    const txnDate  = parseDate(rawDate);
    if (!txnDate) continue;

    const valueDt   = parseDate(col(row, 3)) ?? txnDate;
    const withdrawal = toFloat(col(row, 4));
    const deposit    = toFloat(col(row, 5));
    const closing    = toFloat(col(row, 6)) ?? 0;

    transactions.push(makeTxn(
      idx++,
      txnDate,
      valueDt,
      col(row, 1),
      stripRef(col(row, 2)),
      withdrawal,
      deposit,
      closing,
    ));
  }

  return {
    accountNumber:  meta.accountNumber  ?? null,
    accountHolder:  meta.accountHolder  ?? null,
    bankName:       'HDFC Bank',
    summary,
    transactions,
    validate() {
      const warnings: string[] = [];
      const calcCredits = transactions.reduce((s, t) => s + (t.deposit    ?? 0), 0);
      const calcDebits  = transactions.reduce((s, t) => s + (t.withdrawal ?? 0), 0);
      const calcClosing = summary.openingBalance + calcCredits - calcDebits;

      if (Math.abs(calcCredits - summary.totalCredits) > 0.01)
        warnings.push(`Credits mismatch: parsed ₹${calcCredits.toFixed(2)} vs summary ₹${summary.totalCredits.toFixed(2)}`);
      if (Math.abs(calcDebits - summary.totalDebits) > 0.01)
        warnings.push(`Debits mismatch: parsed ₹${calcDebits.toFixed(2)} vs summary ₹${summary.totalDebits.toFixed(2)}`);
      if (Math.abs(calcClosing - summary.closingBalance) > 0.01)
        warnings.push(`Closing balance mismatch: computed ₹${calcClosing.toFixed(2)} vs summary ₹${summary.closingBalance.toFixed(2)}`);
      if (transactions.length !== summary.debitCount + summary.creditCount)
        warnings.push(`Row count mismatch: parsed ${transactions.length} vs summary ${summary.debitCount + summary.creditCount}`);
      return warnings;
    },
  };
}
