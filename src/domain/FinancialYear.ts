/**
 * Indian Financial Year helpers (April 1 – March 31).
 * Mirrors Android FinancialYear.kt exactly.
 */

/**
 * The FY start year for a given calendar date.
 * e.g. 2025-05-07 → 2025 (FY 2025-26)
 *      2026-01-15 → 2025 (FY 2025-26)
 */
export function fyStartYear(date: Date = new Date()): number {
  const month = date.getMonth() + 1; // 1-based
  const year  = date.getFullYear();
  return month >= 4 ? year : year - 1;
}

/** Short label "YYYY-YY" (no "FY" prefix) — matches sheet format. */
export function fyShort(startYear: number): string {
  const end = ((startYear + 1) % 100).toString().padStart(2, '0');
  return `${startYear}-${end}`;
}

/** Current FY label, e.g. "2025-26". */
export function currentFyLabel(): string {
  return fyShort(fyStartYear());
}

/** Next FY label, e.g. "2026-27". */
export function nextFyLabel(): string {
  return fyShort(fyStartYear() + 1);
}

/**
 * Whether it is currently the advance-payment window (January–March).
 * During Jan-Mar a member may pay fees for the *next* FY.
 */
export function isAdvanceWindow(date: Date = new Date()): boolean {
  const m = date.getMonth() + 1;
  return m >= 1 && m <= 3;
}

/**
 * All FY options for dropdowns.
 * Range: 2019-20 (earliest MMBS records) through next FY.
 * Returned newest-first so new enrolments are at the top.
 *
 * @param detectedLabels Labels detected from the Membership Tracker sheet header row.
 */
export function buildFyOptions(detectedLabels: string[] = []): string[] {
  const nextStart = fyStartYear() + 1;
  const generated: string[] = [];
  for (let y = 2019; y <= nextStart; y++) {
    generated.push(fyShort(y));
  }
  // Merge detected labels (may include future columns the generator doesn't cover)
  const merged = Array.from(new Set([...generated, ...detectedLabels]));
  // Sort newest-first
  merged.sort((a, b) => {
    const aYear = parseInt(a.split('-')[0], 10);
    const bYear = parseInt(b.split('-')[0], 10);
    return bYear - aYear;
  });
  return merged;
}

/** Parse a short label "2025-26" → start year 2025.  Returns null if not parseable. */
export function parseFyStartYear(label: string): number | null {
  const m = label.match(/^(\d{4})-\d{2}$/);
  if (!m) return null;
  return parseInt(m[1], 10);
}
