/**
 * XlsxReader — minimal .xlsx parser using the browser's native DecompressionStream.
 *
 * An .xlsx file is a ZIP archive. We only need "xl/worksheets/sheet1.xml"
 * (data) and "xl/sharedStrings.xml" (string table).
 *
 * Returns a 2-D array of string values (all cells as strings).
 * Blank cells produce "".
 *
 * Supports:
 *  - Shared strings (type="s")
 *  - Inline strings (type="inlineStr")
 *  - Number / date cells (returns raw numeric string)
 *  - Empty cells → ""
 *
 * Does NOT support: formulas, rich text, multiple sheets (always reads Sheet1).
 */

// ── ZIP reader (browser-native) ────────────────────────────────────────────

/** Very small PK-ZIP central-directory parser. Works on .xlsx in-memory. */
async function readZipEntries(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const data = new Uint8Array(buf);
  const view = new DataView(buf);
  const entries = new Map<string, Uint8Array>();

  // Find End-of-Central-Directory signature (0x06054b50) from the end
  let eocd = -1;
  for (let i = data.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid ZIP file.');

  const cdOffset = view.getUint32(eocd + 16, true);
  const cdCount  = view.getUint16(eocd + 8, true);

  let pos = cdOffset;
  for (let i = 0; i < cdCount; i++) {
    if (view.getUint32(pos, true) !== 0x02014b50)
      throw new Error('Bad central directory signature.');

    const fnLen    = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const cmtLen   = view.getUint16(pos + 32, true);
    const method   = view.getUint16(pos + 10, true);
    const localOff = view.getUint32(pos + 42, true);
    const compSize = view.getUint32(pos + 20, true);

    const name = new TextDecoder().decode(data.subarray(pos + 46, pos + 46 + fnLen));
    pos += 46 + fnLen + extraLen + cmtLen;

    // Read local file header
    const lhFnLen    = view.getUint16(localOff + 26, true);
    const lhExtraLen = view.getUint16(localOff + 28, true);
    const dataStart  = localOff + 30 + lhFnLen + lhExtraLen;
    const compressed = data.subarray(dataStart, dataStart + compSize);

    if (method === 0) {
      // Stored
      entries.set(name, compressed);
    } else if (method === 8) {
      // Deflate — use DecompressionStream (Chrome 80+, Firefox 113+, Safari 16.4+)
      const ds = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      writer.write(compressed);
      writer.close();
      const chunks: Uint8Array[] = [];
      const reader = ds.readable.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const total = chunks.reduce((s, c) => s + c.length, 0);
      const out = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) { out.set(c, off); off += c.length; }
      entries.set(name, out);
    }
  }
  return entries;
}

// ── XML text extractor ─────────────────────────────────────────────────────

function getText(xml: string): string {
  return xml.replace(/<[^>]+>/g, '').trim();
}

// ── Shared strings parser ──────────────────────────────────────────────────

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  // Each <si> element holds one string
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml)) !== null) {
    strings.push(getText(m[1]));
  }
  return strings;
}

// ── Column letter to 0-based index ────────────────────────────────────────

function colIndex(ref: string): number {
  const letters = ref.replace(/\d/g, '');
  let n = 0;
  for (const ch of letters) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

function rowIndex(ref: string): number {
  return parseInt(ref.replace(/\D/g, ''), 10) - 1;
}

// ── Sheet parser ───────────────────────────────────────────────────────────

function parseSheet(xml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];

  const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRe.exec(xml)) !== null) {
    const cellRe = /<c\s([^>]*)>([\s\S]*?)<\/c>/g;
    let cellMatch: RegExpExecArray | null;
    const rowCells: [number, string][] = [];

    while ((cellMatch = cellRe.exec(rowMatch[1] + rowMatch[2])) !== null) {
      const attrs = cellMatch[1];
      const inner = cellMatch[2];

      const refM = /r="([A-Z]+\d+)"/.exec(attrs);
      if (!refM) continue;
      const col = colIndex(refM[1]);

      const typeM = /t="([^"]+)"/.exec(attrs);
      const cellType = typeM ? typeM[1] : '';

      let value = '';
      if (cellType === 's') {
        // Shared string index
        const vM = /<v>([^<]*)<\/v>/.exec(inner);
        const idx = vM ? parseInt(vM[1], 10) : -1;
        value = sharedStrings[idx] ?? '';
      } else if (cellType === 'inlineStr') {
        const tM = /<t>([^<]*)<\/t>/.exec(inner);
        value = tM ? tM[1] : '';
      } else {
        // Number, date, boolean, or empty
        const vM = /<v>([^<]*)<\/v>/.exec(inner);
        value = vM ? vM[1] : '';
      }

      rowCells.push([col, value]);
    }

    if (rowCells.length === 0) continue;
    const maxCol = Math.max(...rowCells.map(([c]) => c));
    const row: string[] = Array(maxCol + 1).fill('');
    for (const [c, v] of rowCells) row[c] = v;
    rows.push(row);
  }

  return rows;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Parse an .xlsx File object and return its first sheet as a 2D string array.
 * Throws on format errors.
 */
export async function readXlsx(file: File): Promise<string[][]> {
  const buf = await file.arrayBuffer();
  const entries = await readZipEntries(buf);

  const dec = new TextDecoder('utf-8');

  const ssEntry = entries.get('xl/sharedStrings.xml');
  const sharedStrings = ssEntry ? parseSharedStrings(dec.decode(ssEntry)) : [];

  // Try sheet1.xml or the first sheet we can find
  const sheetEntry =
    entries.get('xl/worksheets/sheet1.xml') ??
    [...entries.entries()].find(([k]) => k.startsWith('xl/worksheets/sheet'))?.[1];

  if (!sheetEntry) throw new Error('No worksheet found in .xlsx file.');

  return parseSheet(dec.decode(sheetEntry), sharedStrings);
}
