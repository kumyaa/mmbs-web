import { db } from '../db/db';

export const configStore = {
  async get(key: string): Promise<string | undefined> {
    const row = await db.configKv.get(key);
    return row?.value;
  },

  async set(key: string, value: string): Promise<void> {
    await db.configKv.put({ key, value });
  },

  async getSpreadsheetId(): Promise<string | undefined> {
    return this.get('spreadsheetId');
  },

  async getLastSyncAt(): Promise<number | undefined> {
    const v = await this.get('lastSyncAt');
    return v ? parseInt(v, 10) : undefined;
  },

  async getKnownFyLabels(): Promise<string[]> {
    const v = await this.get('knownFyLabels');
    return v ? v.split(',').filter(Boolean) : [];
  },
};
