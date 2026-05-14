/**
 * Thin wrapper around Google Sheets REST API v4.
 * Uses the same endpoints as the Android SheetsClient.kt.
 *
 * All methods accept a `getToken` callback that returns a fresh access token.
 */

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_BASE = 'https://www.googleapis.com/drive/v3/files';

export type GetToken = () => Promise<string>;

// ── Types returned by the Sheets API ──────────────────────────────────────

export interface ValueRange {
  range: string;
  majorDimension?: string;
  values?: string[][];
}

export interface BatchGetResponse {
  spreadsheetId: string;
  valueRanges: ValueRange[];
}

// ── helpers ────────────────────────────────────────────────────────────────

async function apiFetch<T>(
  url: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Read multiple ranges in one HTTP call.
 * `ranges` items use A1 notation, e.g. "Members!A:Z".
 */
export async function batchGet(
  spreadsheetId: string,
  ranges: string[],
  getToken: GetToken,
): Promise<BatchGetResponse> {
  const token = await getToken();
  const params = new URLSearchParams();
  ranges.forEach((r) => params.append('ranges', r));
  params.set('valueRenderOption', 'FORMATTED_VALUE');
  params.set('dateTimeRenderOption', 'FORMATTED_STRING');
  const url = `${BASE}/${spreadsheetId}/values:batchGet?${params}`;
  return apiFetch<BatchGetResponse>(url, token);
}

/**
 * Overwrite a single range of cells.
 * Used for updating existing rows (syncStatus → SYNCED after success).
 */
export async function valuesUpdate(
  spreadsheetId: string,
  range: string,
  values: string[][],
  getToken: GetToken,
): Promise<void> {
  const token = await getToken();
  const url =
    `${BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}` +
    '?valueInputOption=USER_ENTERED';
  await apiFetch(url, token, {
    method: 'PUT',
    body: JSON.stringify({ range, majorDimension: 'ROWS', values }),
  });
}

/**
 * Append rows to a sheet (for new records that don't have a sheetRowIndex yet).
 */
export async function valuesAppend(
  spreadsheetId: string,
  range: string,        // e.g. "Members!A:Z"
  values: string[][],
  getToken: GetToken,
): Promise<{ updatedRange: string }> {
  const token = await getToken();
  const url =
    `${BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}:append` +
    '?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS';
  const resp = await apiFetch<{ updates: { updatedRange: string } }>(
    url,
    token,
    { method: 'POST', body: JSON.stringify({ values }) },
  );
  return { updatedRange: resp.updates.updatedRange };
}

/**
 * Validate that a spreadsheet exists and the token has access to it.
 * Returns the spreadsheet title on success.
 */
export async function validateSpreadsheet(
  spreadsheetId: string,
  getToken: GetToken,
): Promise<string> {
  const token = await getToken();
  const url = `${DRIVE_BASE}/${spreadsheetId}?fields=name`;
  const data = await apiFetch<{ name: string }>(url, token);
  return data.name;
}

/** Parse a spreadsheet URL or bare ID into just the ID. */
export function extractSpreadsheetId(urlOrId: string): string {
  const m = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return urlOrId.trim();
}
