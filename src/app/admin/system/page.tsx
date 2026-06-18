'use client';

import { useEffect, useState } from 'react';

interface SystemEvent { id: string; eventType: string; severity: string; message: string; createdAt: string; actor: { id: string; name: string; email: string } | null; project: { id: string; name: string } | null }
interface FollowUp { id: string; type: string; description: string; status: string; createdAt: string; project: { id: string; name: string } | null }
interface AuditLog { id: string; actionType: string; entityType: string; role: string; createdAt: string; actor: { id: string; name: string; email: string } | null; project: { id: string; name: string } | null }

const SEV: Record<string, { bg: string; fg: string; dot: string }> = {
  INFO:     { bg: 'rgba(96,165,250,0.1)',   fg: '#60a5fa', dot: '#60a5fa' },
  WARNING:  { bg: 'rgba(251,146,60,0.1)',   fg: '#fb923c', dot: '#fb923c' },
  ERROR:    { bg: 'rgba(224,96,80,0.1)',    fg: '#e06050', dot: '#e06050' },
  CRITICAL: { bg: 'rgba(224,96,80,0.18)',   fg: '#ff6b6b', dot: '#ff6b6b' },
};
const FU: Record<string, { bg: string; fg: string }> = {
  OPEN:      { bg: 'rgba(251,146,60,0.13)', fg: '#fb923c' },
  ESCALATED: { bg: 'rgba(224,96,80,0.13)',  fg: '#e06050' },
  RESOLVED:  { bg: 'rgba(92,186,128,0.13)', fg: '#5cba80' },
};

function fmt(d: string) {
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function fmtType(s: string) {
  return s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

type Tab = 'followups' | 'events' | 'audit';

export default function AdminSystemPage() {
  const [data, setData] = useState<{ systemEvents: SystemEvent[]; followUps: FollowUp[]; auditLogs: AuditLog[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('followups');

  useEffect(() => {
    fetch('/api/admin/system').then(r => r.json())
      .then(d => { if (d.success) setData(d.data); else setError(d.error); })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }, []);

  const openCount      = data?.followUps.filter(f => f.status === 'OPEN').length ?? 0;
  const escalatedCount = data?.followUps.filter(f => f.status === 'ESCALATED').length ?? 0;
  const criticalEvents = data?.systemEvents.filter(e => e.severity === 'CRITICAL' || e.severity === 'ERROR').length ?? 0;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'followups', label: `Follow-ups (${(openCount + escalatedCount)})` },
    { key: 'events',    label: `Events (${data?.systemEvents.length ?? 0})` },
    { key: 'audit',     label: `Audit (${data?.auditLogs.length ?? 0})` },
  ];

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-7 lg:px-9 lg:py-8 max-w-[1400px]">

      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl sm:text-2xl font-bold text-[#e8e4dc]">System &amp; Issues</h1>
        <p className="text-[13px] text-[rgba(232,228,220,0.45)] mt-1">Open follow-ups, system events, and audit trail</p>
      </div>

      {/* Health Cards — 2 cols on mobile, 4 on sm */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Open Issues', value: openCount,      color: openCount > 0 ? '#fb923c' : '#5cba80', sub: 'Require attention' },
          { label: 'Escalated',   value: escalatedCount, color: escalatedCount > 0 ? '#e06050' : '#5cba80', sub: 'High priority' },
          { label: 'Sys Errors',  value: criticalEvents, color: criticalEvents > 0 ? '#e06050' : '#5cba80', sub: 'ERROR + CRITICAL' },
          { label: 'Status',      value: null,           color: criticalEvents > 0 ? '#e06050' : '#5cba80', sub: criticalEvents > 0 ? 'Issues Found' : 'Healthy' },
        ].map(({ label, value, color, sub }) => (
          <div key={label} className="bg-[#16161c] border border-[rgba(255,255,255,0.07)] rounded-xl p-4">
            <div className="text-[10.5px] text-[rgba(232,228,220,0.4)] font-semibold uppercase tracking-wide mb-2">{label}</div>
            {value !== null
              ? <div className="text-2xl sm:text-3xl font-bold" style={{ color }}>{value}</div>
              : <div className="flex items-center gap-2 mt-1">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
                  <span className="text-base sm:text-lg font-bold" style={{ color }}>{sub}</span>
                </div>
            }
            {value !== null && <div className="text-[11px] text-[rgba(232,228,220,0.35)] mt-1">{sub}</div>}
          </div>
        ))}
      </div>

      {/* Tabs — scrollable on mobile */}
      <div className="flex gap-1 mb-5 bg-[#16161c] border border-[rgba(255,255,255,0.07)] rounded-xl p-1 w-fit max-w-full overflow-x-auto">
        {tabs.map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className="shrink-0 px-3 sm:px-4 py-2 rounded-lg text-[12.5px] sm:text-[13px] font-medium transition-colors whitespace-nowrap"
            style={{
              background: tab === key ? 'rgba(var(--ax-accent-rgb),0.12)' : 'transparent',
              color: tab === key ? 'var(--ax-accent)' : 'rgba(var(--ax-text-rgb),0.5)',
            }}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-[rgba(232,228,220,0.4)] text-sm">Loading system data…</div>
      ) : error ? (
        <div className="p-4 text-[#e06050] text-sm">{error}</div>
      ) : !data ? null : (

        <div className="bg-[#16161c] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-hidden">

          {/* Follow-ups */}
          {tab === 'followups' && (
            data.followUps.length === 0
              ? <div className="px-5 py-12 text-center text-[#5cba80] text-sm">✓ No open issues</div>
              : <>
                  {/* Mobile cards */}
                  <div className="block sm:hidden divide-y divide-[rgba(255,255,255,0.05)]">
                    {data.followUps.map(f => {
                      const s = FU[f.status] ?? { bg: 'rgba(255,255,255,0.05)', fg: 'var(--ax-text)' };
                      return (
                        <div key={f.id} className="p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.fg }}>{f.status}</span>
                            <span className="text-[11.5px] font-semibold text-[#fb923c]">{fmtType(f.type)}</span>
                          </div>
                          <p className="text-[12.5px] text-[rgba(232,228,220,0.7)] mb-1.5">{f.description}</p>
                          <div className="text-[11px] text-[rgba(232,228,220,0.35)]">{f.project?.name ?? '—'} · {fmt(f.createdAt)}</div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Desktop table */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full border-collapse min-w-[580px]">
                      <thead><tr className="bg-[rgba(255,255,255,0.02)]">
                        {['Status', 'Type', 'Description', 'Project', 'Created'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[10.5px] font-semibold text-[rgba(232,228,220,0.35)] uppercase tracking-wide">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {data.followUps.map(f => {
                          const s = FU[f.status] ?? { bg: 'rgba(255,255,255,0.05)', fg: 'var(--ax-text)' };
                          return (
                            <tr key={f.id} className="border-t border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.02)]">
                              <td className="px-4 py-3"><span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.fg }}>{f.status}</span></td>
                              <td className="px-4 py-3 text-[12.5px] text-[#fb923c] font-semibold whitespace-nowrap">{fmtType(f.type)}</td>
                              <td className="px-4 py-3 text-[12.5px] text-[rgba(232,228,220,0.7)] max-w-[300px]">{f.description}</td>
                              <td className="px-4 py-3 text-[12.5px] text-[rgba(232,228,220,0.5)]">{f.project?.name ?? '—'}</td>
                              <td className="px-4 py-3 text-[11.5px] text-[rgba(232,228,220,0.35)] whitespace-nowrap">{fmt(f.createdAt)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
          )}

          {/* System Events */}
          {tab === 'events' && (
            data.systemEvents.length === 0
              ? <div className="px-5 py-12 text-center text-[rgba(232,228,220,0.3)] text-sm">No events recorded</div>
              : <>
                  {/* Mobile */}
                  <div className="block sm:hidden divide-y divide-[rgba(255,255,255,0.05)]">
                    {data.systemEvents.map(e => {
                      const sv = SEV[e.severity] ?? SEV['INFO'];
                      return (
                        <div key={e.id} className="p-4">
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: sv.dot }} />
                            <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full" style={{ background: sv.bg, color: sv.fg }}>{e.severity}</span>
                            <span className="text-[12px] font-semibold text-[rgba(232,228,220,0.7)]">{fmtType(e.eventType)}</span>
                          </div>
                          <p className="text-[12.5px] text-[rgba(232,228,220,0.65)] mb-1.5">{e.message}</p>
                          <div className="text-[11px] text-[rgba(232,228,220,0.35)]">{e.actor?.name ?? '—'} · {e.project?.name ?? '—'} · {fmt(e.createdAt)}</div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Desktop */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full border-collapse min-w-[620px]">
                      <thead><tr className="bg-[rgba(255,255,255,0.02)]">
                        {['Severity', 'Event', 'Message', 'Actor', 'Project', 'Time'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[10.5px] font-semibold text-[rgba(232,228,220,0.35)] uppercase tracking-wide">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {data.systemEvents.map(e => {
                          const sv = SEV[e.severity] ?? SEV['INFO'];
                          return (
                            <tr key={e.id} className="border-t border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.02)]">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-2 h-2 rounded-full" style={{ background: sv.dot }} />
                                  <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full" style={{ background: sv.bg, color: sv.fg }}>{e.severity}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-[12px] font-semibold text-[rgba(232,228,220,0.7)] whitespace-nowrap">{fmtType(e.eventType)}</td>
                              <td className="px-4 py-3 text-[12.5px] text-[rgba(232,228,220,0.65)] max-w-[280px]">{e.message}</td>
                              <td className="px-4 py-3 text-[12.5px] text-[rgba(232,228,220,0.5)]">{e.actor?.name ?? '—'}</td>
                              <td className="px-4 py-3 text-[12.5px] text-[rgba(232,228,220,0.5)]">{e.project?.name ?? '—'}</td>
                              <td className="px-4 py-3 text-[11.5px] text-[rgba(232,228,220,0.35)] whitespace-nowrap">{fmt(e.createdAt)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
          )}

          {/* Audit Log */}
          {tab === 'audit' && (
            data.auditLogs.length === 0
              ? <div className="px-5 py-12 text-center text-[rgba(232,228,220,0.3)] text-sm">No audit logs</div>
              : <>
                  {/* Mobile */}
                  <div className="block sm:hidden divide-y divide-[rgba(255,255,255,0.05)]">
                    {data.auditLogs.map(a => (
                      <div key={a.id} className="p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[13px] font-semibold text-[#e8e4dc]">{a.actor?.name ?? '—'}</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[rgba(var(--ax-accent-rgb),0.1)] text-[var(--ax-accent)]">{a.role}</span>
                        </div>
                        <div className="text-[12.5px] text-[rgba(232,228,220,0.6)] mb-1">
                          {fmtType(a.actionType)} · <span className="text-[rgba(232,228,220,0.45)]">{a.entityType}</span>
                        </div>
                        <div className="text-[11px] text-[rgba(232,228,220,0.35)]">{a.project?.name ?? '—'} · {fmt(a.createdAt)}</div>
                      </div>
                    ))}
                  </div>
                  {/* Desktop */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full border-collapse min-w-[560px]">
                      <thead><tr className="bg-[rgba(255,255,255,0.02)]">
                        {['Action', 'Entity', 'Actor', 'Role', 'Project', 'Time'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[10.5px] font-semibold text-[rgba(232,228,220,0.35)] uppercase tracking-wide">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {data.auditLogs.map(a => (
                          <tr key={a.id} className="border-t border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.02)]">
                            <td className="px-4 py-3 text-[12.5px] text-[var(--ax-accent)] font-semibold whitespace-nowrap">{fmtType(a.actionType)}</td>
                            <td className="px-4 py-3 text-[12.5px] text-[rgba(232,228,220,0.65)]">{a.entityType}</td>
                            <td className="px-4 py-3">
                              <div className="text-[13px] text-[#e8e4dc] font-medium">{a.actor?.name ?? '—'}</div>
                              <div className="text-[11px] text-[rgba(232,228,220,0.4)]">{a.actor?.email}</div>
                            </td>
                            <td className="px-4 py-3 text-[12px] text-[rgba(232,228,220,0.5)]">{a.role}</td>
                            <td className="px-4 py-3 text-[12.5px] text-[rgba(232,228,220,0.5)]">{a.project?.name ?? '—'}</td>
                            <td className="px-4 py-3 text-[11.5px] text-[rgba(232,228,220,0.35)] whitespace-nowrap">{fmt(a.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
          )}
        </div>
      )}
    </div>
  );
}
