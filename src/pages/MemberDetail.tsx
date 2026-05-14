/**
 * S-08 — Member Detail (Phase B full, Phase A stub).
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../db/db';
import type { MemberEntity, FyCell } from '../db/schema';
import { useAuth } from '../auth/AuthContext';
import { BottomNav } from '../components/BottomNav';
import { SyncIcon } from '../components/SyncIcon';
import { FamilyEditModal, type FamilySlot } from '../components/FamilyEditModal';
import { currentFyLabel } from '../domain/FinancialYear';
import { memberStore } from '../store/memberStore';
import { PushQueue } from '../sync/PushQueue';

const CURRENT_FY = currentFyLabel();

export function MemberDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role, getToken, spreadsheetId } = useAuth();

  const member = useLiveQuery(() => (id ? db.members.get(id) : undefined), [id]);
  const membershipRow = useLiveQuery(() => (id ? db.membershipRows.get(id) : undefined), [id]);
  const [editingSlot, setEditingSlot] = useState<FamilySlot | null>(null);

  if (!member) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Member not found.</p>
      </div>
    );
  }

  const feesMap = (() => {
    try {
      return JSON.parse(membershipRow?.feesJson ?? '{}') as Record<string, FyCell>;
    } catch {
      return {} as Record<string, FyCell>;
    }
  })();

  const fyEntries = Object.entries(feesMap).sort(([a], [b]) => {
    return parseInt(b.split('-')[0], 10) - parseInt(a.split('-')[0], 10);
  });

  const canWrite = role !== 'Auditor';

  const saveFamilySlot = async (updated: FamilySlot) => {
    if (!member) return;
    const patch: Partial<MemberEntity> = {};
    const p = `fm${updated.slot}` as 'fm2' | 'fm3' | 'fm4';
    (patch as Record<string, string>)[`${p}Name`]    = updated.name;
    (patch as Record<string, string>)[`${p}Rel`]     = updated.relation;
    (patch as Record<string, string>)[`${p}Mobile`]  = updated.mobile;
    (patch as Record<string, string>)[`${p}WaGroup`] = updated.waGroup;
    await memberStore.saveLocalEdit({ ...member, ...patch });
    if (spreadsheetId) PushQueue.schedule(spreadsheetId, getToken, () => {});
    setEditingSlot(null);
  };

  const clearFamilySlot = async (slot: 2 | 3 | 4) => {
    if (!member) return;
    const p = `fm${slot}` as 'fm2' | 'fm3' | 'fm4';
    const patch: Partial<MemberEntity> = {};
    (patch as Record<string, string>)[`${p}Name`]    = '';
    (patch as Record<string, string>)[`${p}Rel`]     = '';
    (patch as Record<string, string>)[`${p}Mobile`]  = '';
    (patch as Record<string, string>)[`${p}WaGroup`] = '';
    await memberStore.saveLocalEdit({ ...member, ...patch });
    if (spreadsheetId) PushQueue.schedule(spreadsheetId, getToken, () => {});
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-primary-500 text-white px-4 pt-12 pb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-white/80 p-1">
            ←
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate">{member.primaryName}</h1>
            <p className="text-xs text-primary-200">{member.memberId} · {member.status}</p>
          </div>
          <SyncIcon status={member.syncStatus} error={member.pushError} />
          {canWrite && (
            <button
              onClick={() => navigate(`/members/${id}/edit`)}
              className="bg-white/20 rounded-lg px-3 py-1.5 text-sm"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Contact info */}
        <Section title="Contact">
          <Row label="Mobile" value={member.primaryMobile} />
          <Row label="Email" value={member.email} />
          <Row label="Address" value={member.address} />
          <Row label="First Year" value={member.firstYear} />
        </Section>

        {/* Membership fees */}
        <Section
          title="Membership Fees"
          action={
            canWrite
              ? {
                  label: '+ Record',
                  onClick: () => navigate(`/members/${id}/payment`),
                }
              : undefined
          }
        >
          {fyEntries.length === 0 ? (
            <p className="text-sm text-gray-400">No payment records.</p>
          ) : (
            fyEntries.map(([fy, cell]) => (
              <button
                key={fy}
                onClick={() =>
                  canWrite ? navigate(`/members/${id}/payment?fy=${fy}`) : undefined
                }
                className={`w-full flex items-center justify-between rounded-lg border px-3 py-2 mb-2 text-sm ${
                  fy === CURRENT_FY
                    ? 'border-amber-400 bg-amber-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <span className="font-medium text-gray-700">{fy}</span>
                <div className="text-right">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      cell.status === 'New' || cell.status === 'Renewed'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-600'
                    }`}
                  >
                    {cell.status || '—'}
                  </span>
                  {cell.amount && (
                    <div className="text-xs text-gray-500 mt-0.5">₹{cell.amount}</div>
                  )}
                </div>
              </button>
            ))
          )}
        </Section>

        {/* Family members */}
        {/* Family members — always show section when canWrite (for adding), or if data exists */}
        {(canWrite || [member.fm2Name, member.fm3Name, member.fm4Name].some(Boolean)) && (
          <Section title="Family Members">
            {([
              { slot: 2 as const, name: member.fm2Name, rel: member.fm2Rel, mobile: member.fm2Mobile, wa: member.fm2WaGroup },
              { slot: 3 as const, name: member.fm3Name, rel: member.fm3Rel, mobile: member.fm3Mobile, wa: member.fm3WaGroup },
              { slot: 4 as const, name: member.fm4Name, rel: member.fm4Rel, mobile: member.fm4Mobile, wa: member.fm4WaGroup },
            ]).map((f) => (
              <div key={f.slot} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex-1 min-w-0">
                  {f.name ? (
                    <>
                      <div className="text-sm font-medium text-gray-800">{f.name}</div>
                      <div className="text-xs text-gray-500">{f.rel}{f.mobile ? ` · ${f.mobile}` : ''}</div>
                    </>
                  ) : (
                    <div className="text-xs text-gray-400 italic">Member {f.slot} — not added</div>
                  )}
                </div>
                <div className="flex gap-1.5">
                  {f.mobile && (
                    <a href={`tel:${f.mobile}`} className="text-xs bg-blue-50 text-blue-600 rounded-lg px-2 py-1">Call</a>
                  )}
                  {f.mobile && f.wa === 'Yes' && (
                    <a href={`https://wa.me/91${f.mobile.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                      className="text-xs bg-green-50 text-green-700 rounded-lg px-2 py-1">WA</a>
                  )}
                  {canWrite && (
                    <button
                      onClick={() => setEditingSlot({ slot: f.slot, name: f.name, relation: f.rel, mobile: f.mobile, waGroup: f.wa })}
                      className="text-xs bg-gray-50 text-gray-600 border border-gray-200 rounded-lg px-2 py-1"
                    >
                      {f.name ? 'Edit' : '+ Add'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </Section>
        )}

        {member.notes && (
          <Section title="Notes">
            <p className="text-sm text-gray-600">{member.notes}</p>
          </Section>
        )}
      </div>

      <div className="h-20" />
      <BottomNav />

      {editingSlot && (
        <FamilyEditModal
          slot={editingSlot}
          onSave={saveFamilySlot}
          onClear={clearFamilySlot}
          onClose={() => setEditingSlot(null)}
        />
      )}
    </div>
  );
}

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
        {action && (
          <button
            onClick={action.onClick}
            className="text-xs text-primary-500 font-semibold"
          >
            {action.label}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between py-1.5 border-b last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm text-gray-800 text-right max-w-[60%]">{value}</span>
    </div>
  );
}
