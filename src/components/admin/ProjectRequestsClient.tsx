'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, XCircle, Clock, Loader2, X } from 'lucide-react';

export interface ProjectRequestRow {
  id: string;
  name: string;
  email: string;
  companyName: string | null;
  phone: string | null;
  projectName: string;
  projectDetails: string | null;
  status: string; // PENDING | APPROVED | REJECTED
  requestedByName: string | null;
  reviewedByEmail: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdProjectId: string | null;
  createdProjectName: string | null;
  createdAt: string;
}

const STATUS_STYLE: Record<string, { bg: string; fg: string; Icon: typeof Clock }> = {
  PENDING:  { bg: 'rgba(251,146,60,0.15)', fg: '#fb923c', Icon: Clock },
  APPROVED: { bg: 'rgba(92,186,128,0.15)', fg: '#5cba80', Icon: CheckCircle2 },
  REJECTED: { bg: 'rgba(224,96,80,0.15)',  fg: '#e06050', Icon: XCircle },
};

function fmt(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.PENDING;
  const Icon = s.Icon;
  return (
    <span className="inline-flex items-center gap-1 text-[10.5px] px-2 py-0.5 rounded-full font-bold" style={{ background: s.bg, color: s.fg }}>
      <Icon className="w-3 h-3" />
      {status}
    </span>
  );
}

export default function ProjectRequestsClient({ initialRequests }: { initialRequests: ProjectRequestRow[] }) {
  const [requests, setRequests] = useState(initialRequests);
  const [filter, setFilter] = useState<'PENDING' | 'ALL'>('PENDING');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ProjectRequestRow | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const visible = filter === 'PENDING' ? requests.filter((r) => r.status === 'PENDING') : requests;
  const pendingCount = requests.filter((r) => r.status === 'PENDING').length;

  async function approve(req: ProjectRequestRow) {
    setBusyId(req.id);
    setError('');
    try {
      const res = await fetch(`/api/admin/project-requests/${req.id}/approve`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to approve');
      const refreshed = await fetch('/api/admin/project-requests').then((r) => r.json());
      if (refreshed.success) {
        setRequests(refreshed.data.requests.map((r: { id: string; name: string; email: string; companyName: string | null; phone: string | null; projectName: string; projectDetails: string | null; status: string; requestedBy: { name: string } | null; reviewedByEmail: string | null; reviewedAt: string | null; rejectionReason: string | null; createdProject: { id: string; name: string } | null; createdAt: string }) => ({
          id: r.id, name: r.name, email: r.email, companyName: r.companyName, phone: r.phone,
          projectName: r.projectName, projectDetails: r.projectDetails, status: r.status,
          requestedByName: r.requestedBy?.name ?? null, reviewedByEmail: r.reviewedByEmail,
          reviewedAt: r.reviewedAt, rejectionReason: r.rejectionReason,
          createdProjectId: r.createdProject?.id ?? null, createdProjectName: r.createdProject?.name ?? null,
          createdAt: r.createdAt,
        })));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setBusyId(null);
    }
  }

  async function reject() {
    if (!rejecting) return;
    setBusyId(rejecting.id);
    setError('');
    try {
      const res = await fetch(`/api/admin/project-requests/${rejecting.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to reject');
      setRequests((prev) => prev.map((r) => r.id === rejecting.id ? { ...r, status: 'REJECTED', rejectionReason: reason.trim() || null } : r));
      setRejecting(null);
      setReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setFilter('PENDING')}
          className={`px-3 py-1.5 rounded-full text-[11.5px] font-semibold transition-all whitespace-nowrap ${filter === 'PENDING' ? 'ax-tab-active' : 'ax-tab-inactive'}`}
        >
          Pending {pendingCount > 0 && `(${pendingCount})`}
        </button>
        <button
          onClick={() => setFilter('ALL')}
          className={`px-3 py-1.5 rounded-full text-[11.5px] font-semibold transition-all whitespace-nowrap ${filter === 'ALL' ? 'ax-tab-active' : 'ax-tab-inactive'}`}
        >
          All ({requests.length})
        </button>
      </div>

      {error && <div className="alert alert-error text-sm">{error}</div>}

      {visible.length === 0 ? (
        <div className="card">
          <div className="card-body text-center py-12 text-sm text-[rgba(var(--ax-text-rgb),0.4)]">
            {filter === 'PENDING' ? 'No pending requests.' : 'No requests yet.'}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((req) => (
            <div key={req.id} className="card">
              <div className="card-body py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-[14.5px] font-semibold text-[var(--ax-text)]">{req.projectName}</h3>
                      <StatusBadge status={req.status} />
                      {req.requestedByName && (
                        <span className="text-[10.5px] px-2 py-0.5 rounded-full font-medium bg-[rgba(var(--ax-accent-rgb),0.1)] text-[var(--ax-accent)]">
                          Existing Client
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] text-[rgba(var(--ax-text-rgb),0.6)] mt-1">
                      {req.name} &middot; {req.email}
                      {req.companyName && ` · ${req.companyName}`}
                      {req.phone && ` · ${req.phone}`}
                    </p>
                    {req.projectDetails && (
                      <p className="text-[12.5px] text-[rgba(var(--ax-text-rgb),0.45)] mt-2 whitespace-pre-wrap">{req.projectDetails}</p>
                    )}
                    <p className="text-[11px] text-[rgba(var(--ax-text-rgb),0.35)] mt-2">Submitted {fmt(req.createdAt)}</p>

                    {req.status === 'APPROVED' && req.createdProjectId && (
                      <p className="text-[12px] text-[#5cba80] mt-2">
                        Created{' '}
                        <Link href={`/admin/projects/${req.createdProjectId}`} className="underline font-medium">
                          {req.createdProjectName}
                        </Link>
                        {req.reviewedByEmail && ` by ${req.reviewedByEmail}`}{req.reviewedAt && ` on ${fmt(req.reviewedAt)}`}
                      </p>
                    )}
                    {req.status === 'REJECTED' && (
                      <p className="text-[12px] text-[#e06050] mt-2">
                        Rejected{req.reviewedByEmail && ` by ${req.reviewedByEmail}`}{req.reviewedAt && ` on ${fmt(req.reviewedAt)}`}
                        {req.rejectionReason && `: "${req.rejectionReason}"`}
                      </p>
                    )}
                  </div>

                  {req.status === 'PENDING' && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => { setRejecting(req); setReason(''); }}
                        disabled={busyId === req.id}
                        className="px-3 py-1.5 rounded-lg text-[12.5px] font-semibold border border-[rgba(224,96,80,0.3)] text-[#e06050] hover:bg-[rgba(224,96,80,0.1)] transition-colors disabled:opacity-50"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => approve(req)}
                        disabled={busyId === req.id}
                        className="px-3 py-1.5 rounded-lg text-[12.5px] font-semibold text-[var(--ax-btn-text)] bg-[var(--ax-accent)] hover:bg-[var(--ax-accent-hover)] transition-colors disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {busyId === req.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Approve
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reject reason modal */}
      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !busyId && setRejecting(null)}>
          <div className="w-full max-w-sm rounded-xl border" style={{ background: 'var(--ax-surface)', borderColor: 'var(--ax-border)' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: 'var(--ax-border)' }}>
              <h3 className="text-[14px] font-semibold text-[var(--ax-text)]">Reject "{rejecting.projectName}"</h3>
              <button onClick={() => setRejecting(null)} disabled={!!busyId}><X className="w-4 h-4 text-[rgba(var(--ax-text-rgb),0.4)]" /></button>
            </div>
            <div className="p-5 space-y-3">
              <label className="text-xs font-medium text-[rgba(var(--ax-text-rgb),0.55)] uppercase tracking-wider block">
                Reason <span className="normal-case font-normal text-[rgba(var(--ax-text-rgb),0.3)]">(optional, sent to the requester)</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="e.g. Couldn't verify payment — please resubmit with company details"
                className="w-full rounded-lg border border-[var(--ax-border)] bg-[var(--ax-input)] px-3 py-2 text-sm text-[var(--ax-text)] placeholder:text-[rgba(var(--ax-text-rgb),0.3)] outline-none focus:border-[rgba(224,96,80,0.5)] resize-none"
              />
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setRejecting(null)} disabled={!!busyId} className="btn btn-secondary text-sm">Cancel</button>
                <button
                  onClick={reject}
                  disabled={!!busyId}
                  className="px-3.5 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-[#e06050] hover:bg-[#c94f40] transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {busyId === rejecting.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Reject Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
