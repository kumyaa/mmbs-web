/**
 * PushQueue — debounced push queue.
 * Waits 2 seconds after the last write before pushing to the sheet.
 * Also registers a sendBeacon handler to flush on page unload.
 *
 * Usage:
 *   PushQueue.schedule(spreadsheetId, getToken, onProgress);
 *   // call every time a local edit is saved to Dexie
 */

import { pushPending, type ProgressCallback } from './SyncEngine';
import type { GetToken } from './SheetsClient';

// Re-export the type for consumers
export type { ProgressCallback };

let timer: ReturnType<typeof setTimeout> | null = null;
let pendingArgs: [string, GetToken, (p: { phase: string; message: string }) => void] | null = null;

export const PushQueue = {
  schedule(
    spreadsheetId: string,
    getToken: GetToken,
    onProgress: (p: { phase: string; message: string }) => void,
  ): void {
    pendingArgs = [spreadsheetId, getToken, onProgress];
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      PushQueue.flush();
    }, 2000);
  },

  async flush(): Promise<void> {
    if (!pendingArgs) return;
    const [id, tok, cb] = pendingArgs;
    pendingArgs = null;
    timer = null;
    try {
      await pushPending(id, tok, cb as Parameters<typeof pushPending>[2]);
    } catch (err) {
      console.error('[PushQueue] flush error', err);
    }
  },
};

/** Call once on app init to flush any unsaved work when the tab closes. */
export function registerUnloadFlush(
  getSpreadsheetId: () => string | null,
  getToken: GetToken,
) {
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      const id = getSpreadsheetId();
      if (!id) return;
      // Best-effort: sendBeacon can't do OAuth PUT requests, so we just
      // do a regular flush synchronously when the page hides.
      PushQueue.flush();
    }
  });
}
