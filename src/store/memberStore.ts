/**
 * Member store — thin wrapper over Dexie that matches the Android MemberRepo API.
 */

import { db } from '../db/db';
import type { MemberEntity } from '../db/schema';
import { format } from 'date-fns';

export const memberStore = {
  async get(memberId: string): Promise<MemberEntity | undefined> {
    return db.members.get(memberId);
  },

  async list(): Promise<MemberEntity[]> {
    return db.members.toArray();
  },

  async saveLocalEdit(entity: MemberEntity): Promise<void> {
    await db.members.put({
      ...entity,
      syncStatus: 'PENDING',
      lastLocalModifiedAt: Date.now(),
    });
  },

  /** Returns the next available member ID ≥ MM-0170. */
  async nextMemberId(): Promise<string> {
    const all = await db.members.toArray();
    const nums = all
      .map((m) => parseInt(m.memberId.replace(/^MM-/, ''), 10))
      .filter((n) => !isNaN(n));
    const max = nums.length > 0 ? Math.max(...nums) : 0;
    const next = Math.max(max, 169) + 1; // floor at MM-0170
    return `MM-${String(next).padStart(4, '0')}`;
  },

  /** New member template with today's date. */
  newTemplate(): Omit<MemberEntity, 'memberId'> {
    return {
      regDate: format(new Date(), 'dd-MMM-yyyy'),
      primaryName: '',
      primaryMobile: '',
      email: '',
      fm2Name: '', fm2Rel: '', fm2Mobile: '', fm2WaGroup: '',
      fm3Name: '', fm3Rel: '', fm3Mobile: '', fm3WaGroup: '',
      fm4Name: '', fm4Rel: '', fm4Mobile: '', fm4WaGroup: '',
      address: '',
      firstYear: '',
      status: 'Active',
      totalFamilyMembers: '',
      waGroupCount: '',
      waValidation: '',
      notes: '',
      syncStatus: 'PENDING',
      lastLocalModifiedAt: Date.now(),
    };
  },
};
