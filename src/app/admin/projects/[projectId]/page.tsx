'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { formatCurrency } from '@/lib/utils';

interface UserRole { role: string; createdAt: string; user: { id: string; name: string; email: string } }
interface Milestone {
  id: string; title: string; state: string; value: number;
  plannedStart: string | null; plannedEnd: string | null;
  vendorUser: { id: string; name: string; email: string } | null;
  paymentEligibility: { state: string; eligibleAmount: number; blockedAmount: number; markedPaidAt: string | null } | null;
}
interface AuditLog { id: string; actionType: string; entityType: string; role: string; reason: string | null; createdAt: string; actor: { id: string; name: string; email: string } | null }
interface FollowUp { id: string; type: string; description: string; status: string; createdAt: string }
interface ProjectDetail { id: string; name: string; description: string | null; status: string; createdAt: string; isExampleProject: boolean; roles: UserRole[] }
interface Data { project: ProjectDetail; milestones: Milestone[]; auditLogs: AuditLog[]; followUps: FollowUp[] }

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  ONGOING:   { bg: 'rgba(92,186,128,0.15)',  fg: '#5cba80' },
  COMPLETED: { bg: 'rgba(var(--ax-accent-rgb),0.15)',  fg: 'var(--ax-accent)' },
  PAUSED:    { bg: 'rgba(251,146,60,0.15)',  fg: '#fb923c' },
  CANCELLED: { bg: 'rgba(224,96,80,0.15)',   fg: '#e06050' },
};
const MS_STATE: Record<string, { bg: string; fg: string }> = {
  DRAFT:       { bg: 'rgba(var(--ax-text-rgb),0.07)', fg: 'rgba(var(--ax-text-rgb),0.45)' },
  IN_PROGRESS: { bg: 'rgba(96,165,250,0.13)',  fg: '#60a5fa' },
  SUBMITTED:   { bg: 'rgba(251,146,60,0.13)',  fg: '#fb923c' },
  VERIFIED:    { bg: 'rgba(92,186,128,0.13)',  fg: '#5cba80' },
  CLOSED:      { bg: 'rgba(var(--ax-accent-rgb),0.13)',  fg: 'var(--ax-accent)' },
};
const PAY_STATE: Record<string, string> = {
  NOT_DUE: 'rgba(var(--ax-text-rgb),0.3)', DUE_PENDING_VERIFICATION: '#fb923c',
  FULLY_ELIGIBLE: '#5cba80', PARTIALLY_ELIGIBLE: '#5cba80',
  BLOCKED: '#e06050', MARKED_PAID: 'var(--ax-accent)',
};
const ROLE_COLOR: Record<string, string> = {
  CLIENT: 'var(--ax-accent)', PMC: '#60a5fa', VENDOR: '#5cba80', CONSULTANT: '#a78bfa', VIEWER: 'rgba(var(--ax-text-rgb),0.4)',
};
const FU_STYLE: Record<string, { bg: string; fg: string }> = {
  OPEN:      { bg: 'rgba(251,146,60,0.13)', fg: '#fb923c' },
  ESCALATED: { bg: 'rgba(224,96,80,0.13)',  fg: '#e06050' },
  RESOLVED:  { bg: 'rgba(92,186,128,0.13)', fg: '#5cba80' },
};

function fmt(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtTime(d: string) {
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function fmtType(s: string) {
  return s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

type Tab = 'team' | 'milestones' | 'audit' | 'issues';

const AUDIT_PAGE_SIZE = 20;
const MS_PAGE_SIZE = 10;

function Pagination({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-t border-[var(--ax-border-subtle)]">
      <span className="text-[11.5px] text-[rgba(var(--ax-text-rgb),0.35)]">
        {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
      </span>
      <div className="flex items-center gap-1.5">
        <button onClick={() => onChange(page - 1)} disabled={page === 0}
          className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ background: 'var(--ax-overlay)', color: 'rgba(var(--ax-text-rgb),0.6)', border: '1px solid var(--ax-border)' }}>
          ← Prev
        </button>
        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
          const p = totalPages <= 5 ? i : Math.max(0, Math.min(page - 2, totalPages - 5)) + i;
          return (
            <button key={p} onClick={() => onChange(p)}
              className="w-8 h-8 rounded-lg text-[12px] font-semibold transition-all"
              style={{
                background: page === p ? 'rgba(var(--ax-accent-rgb),0.2)' : 'var(--ax-overlay)',
                color: page === p ? 'var(--ax-accent)' : 'rgba(var(--ax-text-rgb),0.5)',
                border: page === p ? '1px solid rgba(var(--ax-accent-rgb),0.4)' : '1px solid var(--ax-border)',
              }}>
              {p + 1}
            </button>
          );
        })}
        <button onClick={() => onChange(page + 1)} disabled={page === totalPages - 1}
          className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ background: 'var(--ax-overlay)', color: 'rgba(var(--ax-text-rgb),0.6)', border: '1px solid var(--ax-border)' }}>
          Next →
        </button>
      </div>
    </div>
  );
}

export default function AdminProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('team');
  const [msFilter, setMsFilter] = useState('ALL');
  const [auditPage, setAuditPage] = useState(0);
  const [msPage, setMsPage] = useState(0);

  useEffect(() => {
    fetch(`/api/admin/projects/${projectId}`).then(r => r.json())
      .then(d => { if (d.success) setData(d.data); else setError(d.error); })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }, [projectId]);

  // Reset pagination when switching filters/tabs
  useEffect(() => { setMsPage(0); }, [msFilter, tab]);
  useEffect(() => { setAuditPage(0); }, [tab]);

  if (loading) return <div className="flex items-center justify-center h-screen text-[rgba(var(--ax-text-rgb),0.35)] text-sm">Loading project…</div>;
  if (error) return <div className="p-6 text-[#e06050] text-sm">{error}</div>;
  if (!data) return null;

  const { project, milestones, auditLogs, followUps } = data;
  const st = STATUS_STYLE[project.status] ?? { bg: 'var(--ax-overlay)', fg: 'var(--ax-text)' };

  const roleGroups: Record<string, UserRole[]> = {};
  project.roles.forEach(r => { (roleGroups[r.role] = roleGroups[r.role] ?? []).push(r); });

  const totalValue  = milestones.reduce((s, m) => s + (m.value ?? 0), 0);
  const paidValue   = milestones.filter(m => m.paymentEligibility?.markedPaidAt).reduce((s, m) => s + (m.paymentEligibility?.eligibleAmount ?? 0), 0);
  const eligValue   = milestones.filter(m => ['FULLY_ELIGIBLE', 'PARTIALLY_ELIGIBLE'].includes(m.paymentEligibility?.state ?? '')).reduce((s, m) => s + (m.paymentEligibility?.eligibleAmount ?? 0), 0);
  const blockedVal  = milestones.filter(m => m.paymentEligibility?.state === 'BLOCKED').reduce((s, m) => s + (m.paymentEligibility?.blockedAmount ?? 0), 0);

  const msStateCounts: Record<string, number> = {};
  milestones.forEach(m => { msStateCounts[m.state] = (msStateCounts[m.state] ?? 0) + 1; });
  const allFilteredMs = msFilter === 'ALL' ? milestones : milestones.filter(m => m.state === msFilter);
  const filteredMs = allFilteredMs.slice(msPage * MS_PAGE_SIZE, (msPage + 1) * MS_PAGE_SIZE);
  const openIssues = followUps.filter(f => f.status === 'OPEN' || f.status === 'ESCALATED').length;

  const pagedAuditLogs = auditLogs.slice(auditPage * AUDIT_PAGE_SIZE, (auditPage + 1) * AUDIT_PAGE_SIZE);

  const tabs: { key: Tab; label: string; alert?: boolean }[] = [
    { key: 'team',       label: `Team (${project.roles.length})` },
    { key: 'milestones', label: `Milestones (${milestones.length})` },
    { key: 'audit',      label: `Audit (${auditLogs.length})` },
    { key: 'issues',     label: `Issues (${openIssues})`, alert: openIssues > 0 },
  ];

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-7 lg:px-9 lg:py-8 max-w-[1300px]">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[12px] text-[rgba(var(--ax-text-rgb),0.4)] mb-5">
        <Link href="/admin/projects" className="hover:text-[var(--ax-accent)] transition-colors">Projects</Link>
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        <span className="text-[var(--ax-text)] truncate">{project.name}</span>
      </div>

      {/* Project header card */}
      <div className="bg-[var(--ax-surface)] border border-[var(--ax-border)] rounded-xl p-4 sm:p-6 mb-5">
        <div className="flex flex-wrap items-start gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-[18px] sm:text-[22px] font-bold text-[var(--ax-text)]">{project.name}</h1>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full" style={{ background: st.bg, color: st.fg }}>{project.status}</span>
              {project.isExampleProject && <span className="text-[10px] text-[rgba(var(--ax-text-rgb),0.3)] border border-[var(--ax-border)] px-2 py-0.5 rounded-full">Example</span>}
            </div>
            {project.description && <p className="text-[13px] text-[rgba(var(--ax-text-rgb),0.5)]">{project.description}</p>}
            <p className="text-[11.5px] text-[rgba(var(--ax-text-rgb),0.35)] mt-1">Created {fmt(project.createdAt)}</p>
          </div>
        </div>

        {/* Payment summary — 2×2 on mobile, 4-col on sm */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 pt-4 border-t border-[var(--ax-border-subtle)]">
          {[
            { label: 'Total Value',   value: formatCurrency(totalValue),  color: 'var(--ax-text)' },
            { label: 'Paid',          value: formatCurrency(paidValue),   color: 'var(--ax-accent)' },
            { label: 'Eligible',      value: formatCurrency(eligValue),   color: '#5cba80' },
            { label: 'Blocked',       value: formatCurrency(blockedVal),  color: blockedVal > 0 ? '#e06050' : 'rgba(var(--ax-text-rgb),0.3)' },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <div className="text-[10.5px] text-[rgba(var(--ax-text-rgb),0.4)] font-semibold uppercase tracking-wide mb-1">{label}</div>
              <div className="text-[15px] sm:text-[18px] font-bold leading-tight" style={{ color }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs — scrollable on mobile */}
      <div className="flex gap-0.5 mb-5 bg-[var(--ax-surface)] border border-[var(--ax-border)] rounded-xl p-1 overflow-x-auto w-fit max-w-full">
        {tabs.map(({ key, label, alert }) => (
          <button key={key} onClick={() => setTab(key)}
            className="relative shrink-0 px-3 sm:px-4 py-2 rounded-lg text-[12.5px] sm:text-[13px] font-medium transition-colors whitespace-nowrap"
            style={{ background: tab === key ? 'rgba(var(--ax-accent-rgb),0.12)' : 'transparent', color: tab === key ? 'var(--ax-accent)' : 'rgba(var(--ax-text-rgb),0.5)' }}>
            {label}
            {alert && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#e06050]" />}
          </button>
        ))}
      </div>

      {/* ── TEAM ────────────────────────────────────────────────────────── */}
      {tab === 'team' && (
        <div className="space-y-4">
          {['CLIENT', 'PMC', 'VENDOR', 'CONSULTANT', 'VIEWER'].map(role => {
            const members = roleGroups[role] ?? [];
            if (!members.length) return null;
            return (
              <div key={role} className="bg-[var(--ax-surface)] border border-[var(--ax-border)] rounded-xl overflow-hidden">
                <div className="px-4 sm:px-5 py-3 border-b border-[var(--ax-border-subtle)] flex items-center gap-2.5">
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full" style={{ background: `${ROLE_COLOR[role]}22`, color: ROLE_COLOR[role] }}>{role}</span>
                  <span className="text-[12px] text-[rgba(var(--ax-text-rgb),0.4)]">{members.length} member{members.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="divide-y divide-[var(--ax-border-subtle)]">
                  {members.map(m => (
                    <div key={m.user.id} className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[13px] font-bold"
                        style={{ background: `${ROLE_COLOR[role]}18`, color: ROLE_COLOR[role] }}>
                        {m.user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-semibold text-[var(--ax-text)] truncate">{m.user.name}</div>
                        <div className="text-[12px] text-[rgba(var(--ax-text-rgb),0.45)] truncate">{m.user.email}</div>
                      </div>
                      <div className="text-[11.5px] text-[rgba(var(--ax-text-rgb),0.35)] whitespace-nowrap hidden sm:block">Since {fmt(m.createdAt)}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── MILESTONES ─────────────────────────────────────────────────── */}
      {tab === 'milestones' && (
        <div>
          {/* State filter — scrollable row */}
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1 flex-nowrap">
            {['ALL', 'DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'VERIFIED', 'CLOSED'].map(s => {
              const sst = MS_STATE[s];
              const active = msFilter === s;
              return (
                <button key={s} onClick={() => setMsFilter(s)}
                  className="shrink-0 px-3 py-1.5 rounded-full text-[11.5px] font-semibold cursor-pointer transition-all whitespace-nowrap"
                  style={{
                    background: active ? (sst?.bg ?? 'rgba(var(--ax-accent-rgb),0.12)') : 'var(--ax-overlay)',
                    color: active ? (sst?.fg ?? 'var(--ax-accent)') : 'rgba(var(--ax-text-rgb),0.45)',
                    border: active ? `1px solid ${sst?.fg ?? 'var(--ax-accent)'}44` : '1px solid var(--ax-border)',
                  }}>
                  {s === 'ALL' ? `All (${milestones.length})` : `${fmtType(s)} (${msStateCounts[s] ?? 0})`}
                </button>
              );
            })}
          </div>

          {/* Mobile: Cards */}
          <div className="block lg:hidden space-y-3">
            {filteredMs.map(m => {
              const mst = MS_STATE[m.state] ?? { bg: 'var(--ax-overlay)', fg: 'var(--ax-text)' };
              const pFg = PAY_STATE[m.paymentEligibility?.state ?? 'NOT_DUE'] ?? 'rgba(var(--ax-text-rgb),0.3)';
              return (
                <div key={m.id} className="bg-[var(--ax-surface)] border border-[var(--ax-border)] rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="text-[13.5px] font-semibold text-[var(--ax-text)] flex-1">{m.title}</div>
                    <span className="shrink-0 text-[10.5px] font-bold px-2 py-0.5 rounded-full" style={{ background: mst.bg, color: mst.fg }}>{fmtType(m.state)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[12px]">
                    <div><span className="text-[rgba(var(--ax-text-rgb),0.4)]">Value </span><span className="font-semibold text-[var(--ax-text)]">{formatCurrency(m.value ?? 0)}</span></div>
                    <div><span className="text-[rgba(var(--ax-text-rgb),0.4)]">Eligible </span><span className="font-semibold" style={{ color: pFg }}>{m.paymentEligibility ? formatCurrency(m.paymentEligibility.eligibleAmount) : '—'}</span></div>
                    <div><span className="text-[rgba(var(--ax-text-rgb),0.4)]">Vendor </span><span className="text-[#5cba80]">{m.vendorUser?.name ?? 'Unassigned'}</span></div>
                    <div><span className="text-[rgba(var(--ax-text-rgb),0.4)]">Due </span><span className="text-[rgba(var(--ax-text-rgb),0.6)]">{fmt(m.plannedEnd)}</span></div>
                  </div>
                  {m.paymentEligibility?.state && (
                    <div className="mt-2 text-[11.5px]" style={{ color: pFg }}>{fmtType(m.paymentEligibility.state)}</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop: Table */}
          <div className="hidden lg:block bg-[var(--ax-surface)] border border-[var(--ax-border)] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[700px]">
                <thead>
                  <tr className="bg-[var(--ax-overlay)]">
                    {['Milestone', 'State', 'Value', 'Payment Status', 'Eligible', 'Vendor', 'Due Date'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10.5px] font-semibold text-[rgba(var(--ax-text-rgb),0.35)] uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredMs.length === 0
                    ? <tr><td colSpan={7} className="px-4 py-10 text-center text-[rgba(var(--ax-text-rgb),0.25)] text-sm">No milestones</td></tr>
                    : filteredMs.map(m => {

                      const mst = MS_STATE[m.state] ?? { bg: 'var(--ax-overlay)', fg: 'var(--ax-text)' };
                      const pFg = PAY_STATE[m.paymentEligibility?.state ?? 'NOT_DUE'] ?? 'rgba(var(--ax-text-rgb),0.3)';
                      return (
                        <tr key={m.id} className="border-t border-[var(--ax-border-subtle)] hover:bg-[var(--ax-overlay)]">
                          <td className="px-4 py-3.5">
                            <div className="text-[13.5px] font-semibold text-[var(--ax-text)] max-w-[200px]">{m.title}</div>
                            {m.plannedStart && <div className="text-[11px] text-[rgba(var(--ax-text-rgb),0.35)] mt-0.5">{fmt(m.plannedStart)} → {fmt(m.plannedEnd)}</div>}
                          </td>
                          <td className="px-4 py-3.5"><span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: mst.bg, color: mst.fg }}>{fmtType(m.state)}</span></td>
                          <td className="px-4 py-3.5 text-[13px] font-semibold text-[var(--ax-text)] whitespace-nowrap">{formatCurrency(m.value ?? 0)}</td>
                          <td className="px-4 py-3.5"><span className="text-[12px] font-medium" style={{ color: pFg }}>{fmtType(m.paymentEligibility?.state ?? 'NOT_DUE')}</span></td>
                          <td className="px-4 py-3.5 text-[13px] whitespace-nowrap" style={{ color: pFg }}>{m.paymentEligibility ? formatCurrency(m.paymentEligibility.eligibleAmount) : '—'}</td>
                          <td className="px-4 py-3.5">
                            {m.vendorUser
                              ? <div><div className="text-[12.5px] text-[#5cba80] font-medium">{m.vendorUser.name}</div><div className="text-[11px] text-[rgba(var(--ax-text-rgb),0.35)]">{m.vendorUser.email}</div></div>
                              : <span className="text-[rgba(var(--ax-text-rgb),0.25)] text-[12px]">Unassigned</span>}
                          </td>
                          <td className="px-4 py-3.5 text-[12px] text-[rgba(var(--ax-text-rgb),0.45)] whitespace-nowrap">{fmt(m.plannedEnd)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            <Pagination page={msPage} total={allFilteredMs.length} pageSize={MS_PAGE_SIZE} onChange={setMsPage} />
          </div>
          {/* Mobile pagination */}
          <div className="block lg:hidden">
            <Pagination page={msPage} total={allFilteredMs.length} pageSize={MS_PAGE_SIZE} onChange={setMsPage} />
          </div>
        </div>
      )}

      {/* ── AUDIT LOG ───────────────────────────────────────────────────── */}
      {tab === 'audit' && (
        <div className="bg-[var(--ax-surface)] border border-[var(--ax-border)] rounded-xl overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b border-[var(--ax-border-subtle)] flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[var(--ax-text)]">Audit Trail</span>
            <span className="text-[12px] text-[rgba(var(--ax-text-rgb),0.35)]">{auditLogs.length} entries</span>
          </div>
          {auditLogs.length === 0
            ? <div className="px-5 py-10 text-center text-[rgba(var(--ax-text-rgb),0.25)] text-sm">No audit logs</div>
            : <><div className="divide-y divide-[var(--ax-border-subtle)]">
              {pagedAuditLogs.map(log => (
                <div key={log.id} className="flex items-start gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 hover:bg-[var(--ax-overlay)]">
                  <div className="w-8 h-8 rounded-full bg-[rgba(var(--ax-accent-rgb),0.12)] border border-[rgba(var(--ax-accent-rgb),0.2)] flex items-center justify-center shrink-0 mt-0.5 text-[11px] font-bold text-[var(--ax-accent)]">
                    {log.actor?.name.charAt(0).toUpperCase() ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13px] font-semibold text-[var(--ax-text)]">{log.actor?.name ?? 'Unknown'}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[rgba(var(--ax-accent-rgb),0.1)] text-[var(--ax-accent)] font-semibold">{log.role}</span>
                      <span className="text-[12.5px] text-[rgba(var(--ax-text-rgb),0.5)]">{fmtType(log.actionType)}</span>
                      <span className="text-[12px] text-[rgba(var(--ax-text-rgb),0.35)]">on {log.entityType}</span>
                    </div>
                    {log.reason && <div className="text-[11.5px] text-[rgba(var(--ax-text-rgb),0.4)] mt-0.5 italic">"{log.reason}"</div>}
                    <div className="text-[11px] text-[rgba(var(--ax-text-rgb),0.3)] mt-0.5 block sm:hidden">{fmtTime(log.createdAt)}</div>
                  </div>
                  <div className="text-[11.5px] text-[rgba(var(--ax-text-rgb),0.35)] whitespace-nowrap shrink-0 hidden sm:block">{fmtTime(log.createdAt)}</div>
                </div>
              ))}
            </div>
            <Pagination page={auditPage} total={auditLogs.length} pageSize={AUDIT_PAGE_SIZE} onChange={setAuditPage} />
            </>}
        </div>
      )}

      {/* ── ISSUES ──────────────────────────────────────────────────────── */}
      {tab === 'issues' && (
        <div className="bg-[var(--ax-surface)] border border-[var(--ax-border)] rounded-xl overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b border-[var(--ax-border-subtle)] flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-[var(--ax-text)]">Follow-ups &amp; Issues</span>
            <span className="text-[12px] text-[rgba(var(--ax-text-rgb),0.35)]">{followUps.length} total</span>
            {openIssues > 0 && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[rgba(251,146,60,0.15)] text-[#fb923c]">{openIssues} open</span>}
          </div>
          {followUps.length === 0
            ? <div className="px-5 py-10 text-center text-[#5cba80] text-sm">✓ No open issues for this project</div>
            : <div className="divide-y divide-[var(--ax-border-subtle)]">
              {followUps.map(f => {
                const fs = FU_STYLE[f.status] ?? { bg: 'var(--ax-overlay)', fg: 'var(--ax-text)' };
                return (
                  <div key={f.id} className="flex items-start gap-3 px-4 sm:px-5 py-4 hover:bg-[var(--ax-overlay)]">
                    <span className="shrink-0 text-[10.5px] font-bold px-2 py-0.5 rounded-full mt-0.5" style={{ background: fs.bg, color: fs.fg }}>{f.status}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-[#fb923c] mb-1">{fmtType(f.type)}</div>
                      <div className="text-[13px] text-[rgba(var(--ax-text-rgb),0.7)]">{f.description}</div>
                    </div>
                    <div className="text-[11.5px] text-[rgba(var(--ax-text-rgb),0.35)] whitespace-nowrap shrink-0">{fmt(f.createdAt)}</div>
                  </div>
                );
              })}
            </div>}
        </div>
      )}
    </div>
  );
}
