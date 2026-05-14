import Dexie, { type Table } from 'dexie';
import type {
  AppUserEntity,
  BankReconEntity,
  ConfigKvEntity,
  MemberEntity,
  MembershipRowEntity,
  TransactionEntity,
} from './schema';

class MmbsDatabase extends Dexie {
  members!: Table<MemberEntity, string>;
  membershipRows!: Table<MembershipRowEntity, string>;
  transactions!: Table<TransactionEntity, string>;
  bankRecon!: Table<BankReconEntity, string>;
  configKv!: Table<ConfigKvEntity, string>;
  appUsers!: Table<AppUserEntity, string>;

  constructor() {
    super('MmbsTrackerDb');

    this.version(1).stores({
      members:
        'memberId, status, firstYear, primaryName, syncStatus',
      membershipRows:
        'memberId, syncStatus',
      transactions:
        'txnId, date, type, category, linkedMemberId, syncStatus',
      bankRecon:
        '++id, bankDate, reconStatus, matchedTxnId, syncStatus',
      configKv:
        'key',
      appUsers:
        'email',
    });
  }
}

export const db = new MmbsDatabase();
