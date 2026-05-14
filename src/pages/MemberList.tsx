/**
 * S-07 — Member List (Phase B stub).
 * Full implementation in Phase B.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/db';
import { BottomNav } from '../components/BottomNav';
import { SyncIcon } from '../components/SyncIcon';
import { useAuth } from '../auth/AuthContext';

export function MemberList() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const members = useLiveQuery(
    () =>
      search.trim()
        ? db.members
            .filter((m) =>
              m.primaryName.toLowerCase().includes(search.toLowerCase()) ||
              m.memberId.toLowerCase().includes(search.toLowerCase()) ||
              m.primaryMobile.includes(search),
            )
            .toArray()
        : db.members.orderBy('primaryName').toArray(),
    [search],
    [],
  );

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-primary-500 text-white px-4 pt-12 pb-3">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold">Members</h1>
          {role !== 'Auditor' && (
            <button
              onClick={() => navigate('/members/new')}
              className="bg-white/20 rounded-full w-8 h-8 flex items-center justify-center text-lg"
            >
              +
            </button>
          )}
        </div>
        <input
          type="search"
          placeholder="Search name, ID or mobile…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg bg-white/20 text-white placeholder-white/70 px-3 py-2 text-sm focus:outline-none focus:bg-white/30"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {members?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <p className="text-4xl mb-3">👥</p>
            <p className="text-sm font-medium text-gray-600 mb-1">
              {search.trim() ? 'No members match your search.' : 'No members loaded yet.'}
            </p>
            {!search.trim() && (
              <p className="text-xs text-gray-400 mt-1">
                Tap the ↻ sync button on the Home screen to load data from the spreadsheet.
              </p>
            )}
          </div>
        )}
        {members?.map((m) => (
          <button
            key={m.memberId}
            onClick={() => navigate(`/members/${m.memberId}`)}
            className="w-full flex items-center gap-3 px-4 py-3 bg-white active:bg-gray-50 text-left"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-800 truncate">{m.primaryName}</span>
                <SyncIcon status={m.syncStatus} error={m.pushError} />
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {m.memberId} · {m.primaryMobile}
              </div>
            </div>
            <div className="text-xs text-right flex-shrink-0">
              <span
                className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                  m.status === 'Active'
                    ? 'bg-green-100 text-green-700'
                    : m.status === 'Suspended'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {m.status}
              </span>
            </div>
          </button>
        ))}
      </div>

      <div className="h-20" />
      <BottomNav />
    </div>
  );
}
