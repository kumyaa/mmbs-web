/**
 * S-08 — Member Detail (Phase B full, Phase A stub).
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../db/db';
import { useAuth } from '../auth/AuthContext';
import { BottomNav } from '../components/BottomNav';
import { SyncIcon } from '../components/SyncIcon';
import { currentFyLabel } from '../domain/FinancialYear';
import type { FyCell } from '../db/schema';

const CURRENT_FY = currentFyLabel();

export function MemberDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();

  const member = useLiveQuery(() => (id ? db.members.get(id) : undefined), [id]);
  const membershipRow = useLiveQuery(() => (id ? db.membershipRows.get(id) : undefined), [id]);

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
        {[
          { name: member.fm2Name, rel: member.fm2Rel, mobile: member.fm2Mobile, wa: member.fm2WaGroup },
          { name: member.fm3Name, rel: member.fm3Rel, mobile: member.fm3Mobile, wa: member.fm3WaGroup },
          { name: member.fm4Name, rel: member.fm4Rel, mobile: member.fm4Mobile, wa: member.fm4WaGroup },
        ].some((f) => f.name) && (
          <Section title="Family Members">
            {[
              { name: member.fm2Name, rel: member.fm2Rel, mobile: member.fm2Mobile, wa: member.fm2WaGroup },
              { name: member.fm3Name, rel: member.fm3Rel, mobile: member.fm3Mobile, wa: member.fm3WaGroup },
              { name: member.fm4Name, rel: member.fm4Rel, mobile: member.fm4Mobile, wa: member.fm4WaGroup },
            ]
              .filter((f) => f.name)
              .map((f, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <div className="text-sm font-medium text-gray-800">{f.name}</div>
                    <div className="text-xs text-gray-500">{f.rel} {f.mobile ? `· ${f.mobile}` : ''}</div>
                  </div>
                  {f.mobile && (
                    <div className="flex gap-2">
                      <a
                        href={`tel:${f.mobile}`}
                        className="text-xs bg-blue-50 text-blue-600 rounded-lg px-2 py-1"
                      >
                        Call
                      </a>
                      {f.wa === 'Yes' && (
                        <a
                          href={`https://wa.me/91${f.mobile.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs bg-green-50 text-green-700 rounded-lg px-2 py-1"
                        >
                          WA
                        </a>
                      )}
                    </div>
                  )}
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
