'use client';

import { DetailPageSkeleton } from '@/components/ui/SkeletonPage';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';

interface EvidenceFile { id: string; fileName: string; mimeType: string; size: number }
interface Evidence {
  id: string; status: string; qtyOrPercent: number; remarks?: string;
  submittedAt: string; submittedBy: { name: string }; files: EvidenceFile[];
}
interface MilestoneData {
  id: string; title: string; plannedValue: number; value: number;
  isExtra: boolean; state: string;
  permissions: { canVerify?: boolean };
  boqLinks: Array<{ plannedQty: number; boqItem: { description: string; unit: string; rate: number } }>;
  evidence: Evidence[];
}

function FileCard({ file }: { file: EvidenceFile }) {
  const url = `/api/files/${file.id}`;
  const isImage = file.mimeType.startsWith('image/');
  const isPDF = file.mimeType === 'application/pdf';
  const kb = Math.round(file.size / 1024);

  if (isImage) return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="group block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={file.fileName}
        className="w-full h-36 object-cover rounded-lg border border-[rgba(255,255,255,0.08)] group-hover:opacity-80 transition-opacity" />
      <p className="text-xs text-[rgba(232,228,220,0.5)] mt-1 truncate">{file.fileName}</p>
      <p className="text-xs text-[rgba(232,228,220,0.3)]">{kb} KB</p>
    </a>
  );

  if (isPDF) return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-3 p-3 rounded-lg border border-[rgba(255,255,255,0.08)] hover:border-[rgba(var(--ax-accent-rgb),0.4)] transition-colors">
      <div className="w-10 h-12 flex items-center justify-center rounded bg-[rgba(220,53,69,0.15)] border border-[rgba(220,53,69,0.3)] shrink-0">
        <span className="text-[#e06050] text-xs font-bold">PDF</span>
      </div>
      <div className="min-w-0">
        <p className="text-sm text-[var(--ax-accent)] hover:underline truncate">{file.fileName}</p>
        <p className="text-xs text-[rgba(232,228,220,0.4)]">{kb} KB</p>
      </div>
    </a>
  );

  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-3 p-3 rounded-lg border border-[rgba(255,255,255,0.08)] hover:border-[rgba(var(--ax-accent-rgb),0.4)] transition-colors">
      <div className="w-10 h-10 flex items-center justify-center rounded bg-[rgba(255,255,255,0.05)] shrink-0">
        <span className="text-xs text-[rgba(232,228,220,0.55)]">FILE</span>
      </div>
      <div className="min-w-0">
        <p className="text-sm text-[var(--ax-accent)] truncate">{file.fileName}</p>
        <p className="text-xs text-[rgba(232,228,220,0.4)]">{kb} KB</p>
      </div>
    </a>
  );
}

export default function VerifyMilestonePage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const milestoneId = params.milestoneId as string;
  const router = useRouter();

  const [qtyVerified, setQtyVerified] = useState('');
  const [verifyNotes, setVerifyNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState('');
  const [hydrated, setHydrated] = useState(false);

  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '';
  const myRole = project?.myRole ?? '';

  const { data: milestone, isLoading: msLoading } = useSWR<MilestoneData>(
    projectId && milestoneId ? `/api/projects/${projectId}/milestones/${milestoneId}` : null,
    jsonFetcher,
    { dedupingInterval: 5_000 },
  );

  const loading = projectLoading || msLoading;

  useEffect(() => {
    if (!milestone || hydrated) return;
    const totalPlannedQty = milestone.boqLinks.reduce((s, l) => s + l.plannedQty, 0);
    setQtyVerified(totalPlannedQty > 0 ? String(totalPlannedQty) : '1');
    if (milestone.state !== 'SUBMITTED') setError('Milestone must be in Evidence Submitted state');
    else if (!milestone.permissions?.canVerify) setError('Only PMC can verify milestones');
    setHydrated(true);
  }, [milestone, hydrated]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifying(true); setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones/${milestoneId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qtyVerified: parseFloat(qtyVerified), notes: verifyNotes || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        router.push(`/projects/${projectId}/milestones/${milestoneId}`);
      } else {
        setError(data.error);
      }
    } catch { setError('Failed to verify'); }
    finally { setVerifying(false); }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) { setError('A reason is required to request revision'); return; }
    setRejecting(true); setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones/${milestoneId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toState: 'IN_PROGRESS', reason: rejectReason.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        router.push(`/projects/${projectId}/milestones/${milestoneId}`);
      } else {
        setError(data.error);
      }
    } catch { setError('Failed to send for revision'); }
    finally { setRejecting(false); }
  };

  if (loading) return <Layout><DetailPageSkeleton /></Layout>;
  if (!milestone) return <Layout><div className="alert alert-error">Milestone not found</div></Layout>;

  const isExtra = milestone.isExtra || milestone.boqLinks.length === 0;
  const totalPlannedQty = milestone.boqLinks.reduce((s, l) => s + l.plannedQty, 0);
  const verifiedRatio = totalPlannedQty > 0 ? parseFloat(qtyVerified) / totalPlannedQty : 1;
  const milestoneValue = isExtra ? milestone.value : milestone.plannedValue;
  const estimatedValue = isExtra ? milestoneValue : milestoneValue * Math.min(verifiedRatio, 1);
  const submittedEvidence = milestone.evidence.filter((e) => e.status !== 'REJECTED');

  // Latest submitted percentage (from most recent evidence)
  const latestEvidence = submittedEvidence[0];
  const submittedPercent = latestEvidence?.qtyOrPercent ?? 0;

  const canAct = myRole === 'PMC' && milestone.state === 'SUBMITTED';

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <button onClick={() => router.back()} className="text-sm text-[rgba(232,228,220,0.45)] hover:text-[#e8e4dc] mb-2 transition-colors">
            ← Back
          </button>
          <h1 className="text-2xl font-bold text-[#e8e4dc]">Review Evidence</h1>
          <p className="text-[rgba(232,228,220,0.55)] mt-0.5">{milestone.title}</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {/* ── Evidence summary card ──────────────────────────────── */}
        {latestEvidence && (
          <div className="card">
            <div className="card-body space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-xs text-[rgba(232,228,220,0.45)] uppercase tracking-wider mb-1">
                    Submitted by
                  </p>
                  <p className="text-base font-medium text-[#e8e4dc]">{latestEvidence.submittedBy.name}</p>
                  <p className="text-xs text-[rgba(232,228,220,0.4)]">{formatDateTime(latestEvidence.submittedAt)}</p>
                </div>

                {/* Percentage donut / arc */}
                <div className="text-center">
                  <p className="text-xs text-[rgba(232,228,220,0.45)] uppercase tracking-wider mb-1">Work done</p>
                  <div className="relative w-20 h-20 mx-auto">
                    <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                      <circle
                        cx="18" cy="18" r="15.9" fill="none"
                        stroke={submittedPercent >= 80 ? '#5cba80' : submittedPercent >= 40 ? 'var(--ax-accent)' : '#e06050'}
                        strokeWidth="3"
                        strokeDasharray={`${submittedPercent} ${100 - submittedPercent}`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-[#e8e4dc]">
                      {submittedPercent}%
                    </span>
                  </div>
                </div>
              </div>

              {latestEvidence.remarks && (
                <div className="p-3 rounded-lg bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)]">
                  <p className="text-xs text-[rgba(232,228,220,0.45)] mb-1">Remarks</p>
                  <p className="text-sm text-[rgba(232,228,220,0.8)]">{latestEvidence.remarks}</p>
                </div>
              )}

              {latestEvidence.files.length > 0 && (
                <div>
                  <p className="text-xs text-[rgba(232,228,220,0.45)] mb-2">
                    {latestEvidence.files.length} attachment{latestEvidence.files.length > 1 ? 's' : ''}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {latestEvidence.files.map((f) => <FileCard key={f.id} file={f} />)}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Multiple evidence submissions */}
        {submittedEvidence.length > 1 && (
          <div className="card">
            <div className="card-header">
              <h2 className="text-base font-semibold">All Submissions ({submittedEvidence.length})</h2>
            </div>
            <div className="card-body space-y-4">
              {submittedEvidence.slice(1).map((ev) => (
                <div key={ev.id} className="border border-[rgba(255,255,255,0.07)] rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-[rgba(232,228,220,0.65)]">{ev.submittedBy.name} · {formatDateTime(ev.submittedAt)}</p>
                    <span className="text-sm font-semibold text-[var(--ax-accent)]">{ev.qtyOrPercent}%</span>
                  </div>
                  {ev.remarks && <p className="text-xs text-[rgba(232,228,220,0.5)]">{ev.remarks}</p>}
                  {ev.files.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {ev.files.map((f) => <FileCard key={f.id} file={f} />)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── BOQ Summary ──────────────────────────────────────────── */}
        {!isExtra && milestone.boqLinks.length > 0 && (
          <div className="card">
            <div className="card-header"><h2 className="text-base font-semibold">BOQ Reference</h2></div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Description</th><th>Unit</th>
                    <th className="text-right">Planned Qty</th><th className="text-right">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {milestone.boqLinks.map((l, i) => (
                    <tr key={i}>
                      <td>{l.boqItem.description}</td><td>{l.boqItem.unit}</td>
                      <td className="text-right">{l.plannedQty}</td>
                      <td className="text-right">{formatCurrency(l.boqItem.rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── PMC Action cards ──────────────────────────────────────── */}
        {canAct ? (
          <div className="grid md:grid-cols-2 gap-4">

            {/* Verify card */}
            <form onSubmit={handleVerify} className="card border-[rgba(92,186,128,0.25)]">
              <div className="card-body space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[rgba(92,186,128,0.15)] flex items-center justify-center text-[#5cba80] text-lg">✓</div>
                  <h2 className="text-base font-semibold text-[#5cba80]">Verify Milestone</h2>
                </div>
                <p className="text-xs text-[rgba(232,228,220,0.55)]">
                  Confirm the work meets requirements. This will notify the Owner to release payment.
                </p>

                {!isExtra && (
                  <div>
                    <label className="label text-xs">Verified Quantity</label>
                    <input
                      type="number" min="0" step="0.01" required
                      className="input text-sm" value={qtyVerified}
                      onChange={(e) => setQtyVerified(e.target.value)}
                    />
                    <p className="text-xs text-[rgba(232,228,220,0.4)] mt-1">Planned: {totalPlannedQty}</p>
                  </div>
                )}

                <div className="rounded-lg p-3 bg-[rgba(92,186,128,0.06)]">
                  <p className="text-xs text-[rgba(232,228,220,0.45)]">Eligible Value</p>
                  <p className="text-xl font-bold text-[#5cba80]">{formatCurrency(estimatedValue)}</p>
                  {!isExtra && (
                    <p className="text-xs text-[rgba(92,186,128,0.6)] mt-0.5">{(verifiedRatio * 100).toFixed(1)}% of planned</p>
                  )}
                </div>

                <textarea
                  rows={2} className="input resize-none text-sm" value={verifyNotes}
                  onChange={(e) => setVerifyNotes(e.target.value)}
                  placeholder="Verification notes (optional)…"
                />

                <button type="submit" disabled={verifying}
                  className="btn btn-success w-full disabled:opacity-50">
                  {verifying ? 'Verifying…' : 'Verify & Notify Owner'}
                </button>
              </div>
            </form>

            {/* Reject / revision card */}
            <div className="card border-[rgba(224,96,80,0.25)]">
              <div className="card-body space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[rgba(224,96,80,0.15)] flex items-center justify-center text-[#e06050] text-lg">↩</div>
                  <h2 className="text-base font-semibold text-[#e06050]">Request Revision</h2>
                </div>
                <p className="text-xs text-[rgba(232,228,220,0.55)]">
                  Send back to the Vendor for corrections. They will be notified with your reason.
                </p>

                <div>
                  <label className="label text-xs">Reason <span className="text-[#e06050]">*</span></label>
                  <textarea
                    rows={4} className="input resize-none text-sm" value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Describe what needs to be corrected…"
                  />
                </div>

                <button
                  type="button" onClick={handleReject}
                  disabled={rejecting || !rejectReason.trim()}
                  className="btn w-full bg-[rgba(224,96,80,0.15)] text-[#e06050] border border-[rgba(224,96,80,0.3)] hover:bg-[rgba(224,96,80,0.25)] disabled:opacity-50"
                >
                  {rejecting ? 'Sending…' : 'Send for Revision & Notify Vendor'}
                </button>
              </div>
            </div>
          </div>
        ) : myRole !== 'PMC' ? (
          <div className="card">
            <div className="card-body text-center py-6">
              <p className="text-[rgba(232,228,220,0.55)]">Only the PMC can verify or reject milestone submissions.</p>
            </div>
          </div>
        ) : null}
      </div>
    </Layout>
  );
}
