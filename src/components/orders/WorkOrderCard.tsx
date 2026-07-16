'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { CheckCircle2, Clock, XCircle, AlertTriangle } from 'lucide-react';
import { jsonFetcher } from '@/lib/fetcher';
import { formatDate } from '@/lib/utils';
import WorkOrderUploadModal from './WorkOrderUploadModal';
import WorkOrderRevisionCompare from './WorkOrderRevisionCompare';
import GenerateWorkOrderPdfModal from './GenerateWorkOrderPdfModal';

interface Revision {
  id: string;
  revisionNumber: number;
  issueDate: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  fileName: string;
  remarks: string | null;
  reason: string | null;
  vendorAcceptanceStatus: string;
  acceptedAt: string | null;
  vendorRemarks: string | null;
  rejectedAt: string | null;
  createdAt: string;
  createdBy: { name: string };
  acceptedBy: { name: string } | null;
  rejectedBy: { name: string } | null;
  pdfDetailsJson?: string | null;
}

interface WorkOrder {
  id: string;
  number: string;
  status: string;
  currentRevisionNumber: number;
  revisions: Revision[];
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    DRAFT: { label: 'Draft', cls: 'bg-[rgba(255,255,255,0.06)] text-[rgba(232,228,220,0.55)]' },
    ISSUED: { label: 'Issued', cls: 'bg-[rgba(234,179,8,0.15)] text-[#eab308]' },
    PENDING_VENDOR_ACCEPTANCE: { label: 'Pending Vendor Acceptance', cls: 'bg-[rgba(234,179,8,0.15)] text-[#eab308]' },
    ACCEPTED: { label: 'Accepted', cls: 'bg-[rgba(92,186,128,0.15)] text-[#5cba80]' },
    CHANGES_REQUESTED: { label: 'Vendor Requested Changes', cls: 'bg-[rgba(239,68,68,0.15)] text-[#ef4444]' },
  };
  const m = map[status] ?? { label: status, cls: 'bg-[rgba(255,255,255,0.06)] text-[rgba(232,228,220,0.55)]' };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.cls}`}>{m.label}</span>;
}

export default function WorkOrderCard({
  projectId,
  orderId,
  vendorName,
  vendorAssigned,
  canManage,
  isAssignedVendor,
  isPMC,
}: {
  projectId: string;
  orderId: string;
  vendorName: string | null;
  vendorAssigned: boolean;
  canManage: boolean;
  isAssignedVendor: boolean;
  isPMC: boolean;
}) {
  const { data: workOrder, isLoading, mutate } = useSWR<WorkOrder | null>(
    `/api/projects/${projectId}/orders/${orderId}/work-order`,
    jsonFetcher,
  );

  const [showUpload, setShowUpload] = useState<'issue' | 'revision' | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectRemarks, setRejectRemarks] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState('');

  const currentRevision = workOrder?.revisions.find((r) => r.revisionNumber === workOrder.currentRevisionNumber) ?? null;
  const canAccept = isAssignedVendor && currentRevision && currentRevision.vendorAcceptanceStatus === 'PENDING';

  const handleAccept = async () => {
    if (!currentRevision || !workOrder) return;
    setAccepting(true);
    setError('');
    try {
      const res = await fetch(
        `/api/projects/${projectId}/work-orders/${workOrder.id}/revisions/${currentRevision.id}/accept`,
        { method: 'POST' },
      );
      const data = await res.json();
      if (data.success) {
        void mutate();
      } else {
        setError(data.error ?? 'Failed to accept');
      }
    } catch {
      setError('Failed to accept. Please try again.');
    } finally {
      setAccepting(false);
    }
  };

  const handleReject = async () => {
    if (!currentRevision || !workOrder || !rejectRemarks.trim()) return;
    setRejecting(true);
    setError('');
    try {
      const res = await fetch(
        `/api/projects/${projectId}/work-orders/${workOrder.id}/revisions/${currentRevision.id}/reject`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ remarks: rejectRemarks.trim() }) },
      );
      const data = await res.json();
      if (data.success) {
        setShowReject(false);
        setRejectRemarks('');
        void mutate();
      } else {
        setError(data.error ?? 'Failed to send remarks');
      }
    } catch {
      setError('Failed to send remarks. Please try again.');
    } finally {
      setRejecting(false);
    }
  };

  const fileHref = (revisionId: string, download?: boolean) =>
    `/api/projects/${projectId}/work-orders/${workOrder?.id}/revisions/${revisionId}/file${download ? '?download=1' : ''}`;

  return (
    <div className="card">
      <div className="card-header flex justify-between items-center">
        <h2 className="text-lg font-semibold">Work Order</h2>
        <div className="flex gap-2">
          {isPMC && workOrder && (
            <button onClick={() => setShowGenerate(true)} className="btn btn-sm btn-secondary text-xs">
              Generate Work Order PDF
            </button>
          )}
          {canManage && workOrder && (
            <button onClick={() => setShowUpload('revision')} className="btn btn-sm btn-secondary text-xs">
              + Add Revision
            </button>
          )}
        </div>
      </div>
      <div className="card-body space-y-3">
        {error && <div className="alert alert-error text-sm">{error}</div>}

        {isLoading ? (
          <p className="text-sm text-[rgba(232,228,220,0.45)]">Loading…</p>
        ) : !workOrder ? (
          <div className="py-6 text-center space-y-3">
            <p className="text-sm text-[rgba(232,228,220,0.55)]">No Work Order uploaded yet</p>
            {(canManage || isPMC) && (
              <div className="flex justify-center gap-2 flex-wrap">
                {canManage && (
                  <button
                    onClick={() => setShowUpload('issue')}
                    disabled={!vendorAssigned}
                    title={!vendorAssigned ? 'Assign a vendor first' : undefined}
                    className="btn btn-sm btn-primary disabled:opacity-50"
                  >
                    Upload Work Order
                  </button>
                )}
                {isPMC && (
                  <button
                    onClick={() => setShowGenerate(true)}
                    disabled={!vendorAssigned}
                    title={!vendorAssigned ? 'Assign a vendor first' : undefined}
                    className="btn btn-sm btn-secondary disabled:opacity-50"
                  >
                    Generate Work Order PDF
                  </button>
                )}
              </div>
            )}
            {!vendorAssigned && (canManage || isPMC) && (
              <p className="text-xs text-[rgba(232,228,220,0.35)]">Assign a vendor before issuing a Work Order.</p>
            )}
          </div>
        ) : (
          <>
            {currentRevision?.vendorAcceptanceStatus === 'REJECTED' && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.25)]">
                <AlertTriangle className="w-5 h-5 text-[#ef4444] shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-[#ef4444]">
                    Vendor Requested Changes{currentRevision.rejectedBy ? ` — ${currentRevision.rejectedBy.name}` : ''}
                  </p>
                  {currentRevision.vendorRemarks && (
                    <p className="text-xs text-[rgba(239,68,68,0.75)] mt-0.5">{currentRevision.vendorRemarks}</p>
                  )}
                  {canManage && (
                    <p className="text-xs text-[rgba(232,228,220,0.4)] mt-1.5">Use &quot;+ Add Revision&quot; above to issue a new Work Order addressing this.</p>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-[rgba(232,228,220,0.4)]">Number</p>
                <p className="text-[#e8e4dc] mt-0.5">{workOrder.number}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-[rgba(232,228,220,0.4)]">Vendor</p>
                <p className="text-[#e8e4dc] mt-0.5">{vendorName ?? '—'}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-[rgba(232,228,220,0.4)]">Current Revision</p>
                <p className="text-[#e8e4dc] mt-0.5">R{workOrder.currentRevisionNumber}</p>
              </div>
              {currentRevision && (
                <>
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-[rgba(232,228,220,0.4)]">Issue Date</p>
                    <p className="text-[#e8e4dc] mt-0.5">{formatDate(currentRevision.issueDate)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-[rgba(232,228,220,0.4)]">Start</p>
                    <p className="text-[#e8e4dc] mt-0.5">{currentRevision.plannedStart ? formatDate(currentRevision.plannedStart) : '—'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-[rgba(232,228,220,0.4)]">End</p>
                    <p className="text-[#e8e4dc] mt-0.5">{currentRevision.plannedEnd ? formatDate(currentRevision.plannedEnd) : '—'}</p>
                  </div>
                </>
              )}
              <div>
                <p className="text-[11px] uppercase tracking-wider text-[rgba(232,228,220,0.4)]">Status</p>
                <div className="mt-0.5"><StatusBadge status={workOrder.status} /></div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-[rgba(255,255,255,0.06)]">
              {currentRevision && (
                <>
                  <a href={fileHref(currentRevision.id)} target="_blank" rel="noreferrer" className="btn btn-sm btn-secondary text-xs">View Work Order</a>
                  <a href={fileHref(currentRevision.id, true)} className="btn btn-sm btn-secondary text-xs">Download Work Order</a>
                </>
              )}
              {workOrder.revisions.length > 1 && (
                <>
                  <button onClick={() => setShowHistory((v) => !v)} className="btn btn-sm btn-secondary text-xs">
                    {showHistory ? 'Hide' : 'View'} Revision History
                  </button>
                  <button onClick={() => setShowCompare(true)} className="btn btn-sm btn-secondary text-xs">
                    Compare Revisions
                  </button>
                </>
              )}
              {canAccept && (
                <>
                  <button onClick={() => void handleAccept()} disabled={accepting} className="btn btn-sm btn-success text-xs disabled:opacity-50">
                    {accepting ? 'Accepting…' : 'Accept Work Order'}
                  </button>
                  <button
                    onClick={() => { setShowReject(true); setError(''); }}
                    disabled={accepting}
                    className="btn btn-sm text-xs disabled:opacity-50 text-[#ef4444] border border-[rgba(239,68,68,0.35)] hover:bg-[rgba(239,68,68,0.08)]"
                  >
                    Disagree — Send Remarks
                  </button>
                </>
              )}
            </div>

            {showHistory && (
              <ul className="space-y-2 pt-2">
                {[...workOrder.revisions].sort((a, b) => b.revisionNumber - a.revisionNumber).map((r) => (
                  <li key={r.id} className="text-sm p-3 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)]">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-medium text-[#e8e4dc]">R{r.revisionNumber}</span>
                      <span className="flex items-center gap-1 text-xs">
                        {r.vendorAcceptanceStatus === 'ACCEPTED' ? (
                          <span className="inline-flex items-center gap-1 text-[#5cba80]"><CheckCircle2 className="w-3 h-3" /> Accepted{r.acceptedBy ? ` by ${r.acceptedBy.name}` : ''}</span>
                        ) : r.vendorAcceptanceStatus === 'REJECTED' ? (
                          <span className="inline-flex items-center gap-1 text-[#ef4444]"><XCircle className="w-3 h-3" /> Changes requested{r.rejectedBy ? ` by ${r.rejectedBy.name}` : ''}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[#eab308]"><Clock className="w-3 h-3" /> Pending Vendor Acceptance</span>
                        )}
                      </span>
                    </div>
                    <p className="text-xs text-[rgba(232,228,220,0.45)] mt-1">
                      Created by {r.createdBy.name} · {formatDate(r.createdAt)}
                    </p>
                    {r.reason && <p className="text-xs text-[rgba(232,228,220,0.55)] mt-1">Reason: {r.reason}</p>}
                    {r.remarks && <p className="text-xs text-[rgba(232,228,220,0.45)] mt-1">Remarks: {r.remarks}</p>}
                    {r.vendorRemarks && <p className="text-xs text-[#ef4444] mt-1">Vendor remarks: {r.vendorRemarks}</p>}
                    <a href={fileHref(r.id)} target="_blank" rel="noreferrer" className="text-xs text-[var(--ax-accent)] hover:underline mt-1 inline-block">
                      {r.fileName}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {showUpload && (
        <WorkOrderUploadModal
          title={showUpload === 'issue' ? 'Upload Work Order' : 'Add Work Order Revision'}
          isRevision={showUpload === 'revision'}
          submitUrl={
            showUpload === 'issue'
              ? `/api/projects/${projectId}/orders/${orderId}/work-order`
              : `/api/projects/${projectId}/work-orders/${workOrder?.id}/revisions`
          }
          onClose={() => setShowUpload(null)}
          onSaved={() => void mutate()}
        />
      )}
      {showReject && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-md w-full">
            <div className="p-6 space-y-4">
              <h2 className="text-lg font-semibold text-[#e8e4dc]">Send Remarks to PMC</h2>
              <p className="text-xs text-[rgba(232,228,220,0.5)]">Explain what needs to change. PMC will issue a new Work Order.</p>
              {error && <div className="alert alert-error text-sm">{error}</div>}
              <textarea
                autoFocus
                rows={4}
                className="input resize-none w-full"
                placeholder="e.g. Planned dates don't match the site schedule…"
                value={rejectRemarks}
                onChange={(e) => setRejectRemarks(e.target.value)}
              />
              <div className="flex justify-end gap-3">
                <button onClick={() => { setShowReject(false); setError(''); }} className="btn btn-secondary">Cancel</button>
                <button
                  onClick={() => void handleReject()}
                  disabled={rejecting || !rejectRemarks.trim()}
                  className="btn bg-[#ef4444] text-white hover:bg-[#dc2626] disabled:opacity-50"
                >
                  {rejecting ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showCompare && workOrder && (
        <WorkOrderRevisionCompare
          projectId={projectId}
          workOrderId={workOrder.id}
          revisions={workOrder.revisions}
          onClose={() => setShowCompare(false)}
        />
      )}
      {showGenerate && (
        <GenerateWorkOrderPdfModal
          projectId={projectId}
          orderId={orderId}
          workOrder={workOrder ?? null}
          vendorName={vendorName}
          vendorAssigned={vendorAssigned}
          onClose={() => setShowGenerate(false)}
          onSaved={() => void mutate()}
        />
      )}
    </div>
  );
}
