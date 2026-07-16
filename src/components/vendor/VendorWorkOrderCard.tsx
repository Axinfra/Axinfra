'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Eye, Download, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { jsonFetcher } from '@/lib/fetcher';
import { formatDate } from '@/lib/utils';
import VendorStatusPill from './VendorStatusPill';
import VendorActionButton from './VendorActionButton';
import { cardShadow, iconBadge } from './vendorTheme';

interface Revision {
  id: string;
  revisionNumber: number;
  issueDate: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  fileName: string;
  vendorAcceptanceStatus: string;
  acceptedAt: string | null;
  vendorRemarks: string | null;
}

interface WorkOrder {
  id: string;
  number: string;
  status: string;
  currentRevisionNumber: number;
  revisions: Revision[];
}

/** Vendor-only Work Order view: big label:value pairs, two big View/Download buttons, and
 * either a huge green Accept or a red "Not OK" button when action is needed. No
 * revision-compare/diff UI — this persona only needs "what is it", "accept it", or "say why
 * not", not a document-review workflow. */
export default function VendorWorkOrderCard({ projectId, orderId }: { projectId: string; orderId: string }) {
  const { data: workOrder, isLoading, mutate } = useSWR<WorkOrder | null>(
    `/api/projects/${projectId}/orders/${orderId}/work-order`,
    jsonFetcher,
  );

  const [showOlder, setShowOlder] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectRemarks, setRejectRemarks] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState('');

  const currentRevision = workOrder?.revisions.find((r) => r.revisionNumber === workOrder.currentRevisionNumber) ?? null;
  const olderRevisions = workOrder ? workOrder.revisions.filter((r) => r.revisionNumber !== workOrder.currentRevisionNumber) : [];
  const canAct = currentRevision && currentRevision.vendorAcceptanceStatus === 'PENDING';
  const wasRejected = currentRevision?.vendorAcceptanceStatus === 'REJECTED';

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
        setError(data.error ?? 'Could not accept. Try again.');
      }
    } catch {
      setError('Could not accept. Try again.');
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
        setError(data.error ?? 'Could not send. Try again.');
      }
    } catch {
      setError('Could not send. Try again.');
    } finally {
      setRejecting(false);
    }
  };

  const fileHref = (revisionId: string, download?: boolean) =>
    `/api/projects/${projectId}/work-orders/${workOrder?.id}/revisions/${revisionId}/file${download ? '?download=1' : ''}`;

  return (
    <div className="rounded-[28px] border p-6 space-y-5" style={{ borderColor: 'var(--ax-border)', background: 'var(--ax-card)', ...cardShadow }}>
      <h2 className="text-xl font-bold" style={{ color: 'var(--ax-text)' }}>Work Order</h2>

      {error && (
        <p className="text-base font-semibold rounded-2xl px-4 py-3" style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)' }}>{error}</p>
      )}

      {isLoading ? (
        <p className="text-base" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>Loading…</p>
      ) : !workOrder ? (
        <p className="text-base text-center py-6" style={{ color: 'rgba(var(--ax-text-rgb),0.5)' }}>Not sent yet</p>
      ) : (
        <>
          <VendorStatusPill kind="workOrder" status={workOrder.status} />

          {wasRejected && (
            <div className="flex items-start gap-3 rounded-2xl px-4 py-3.5" style={{ background: 'rgba(239,68,68,0.1)', boxShadow: 'inset 0 0 0 1.5px rgba(239,68,68,0.3)' }}>
              <XCircle className="w-6 h-6 shrink-0 mt-0.5" style={{ color: '#ef4444' }} />
              <div>
                <p className="text-base font-bold" style={{ color: '#ef4444' }}>You Said Not OK</p>
                {currentRevision?.vendorRemarks && <p className="text-sm mt-0.5" style={{ color: 'rgba(239,68,68,0.85)' }}>{currentRevision.vendorRemarks}</p>}
                <p className="text-sm mt-1.5 font-semibold flex items-center gap-1.5" style={{ color: 'rgba(var(--ax-text-rgb),0.55)' }}>
                  <Clock className="w-4 h-4" /> Waiting for a new Work Order
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-5">
            {currentRevision && (
              <>
                <InfoBlock label="Start Date" value={currentRevision.plannedStart ? formatDate(currentRevision.plannedStart) : '—'} />
                <InfoBlock label="End Date" value={currentRevision.plannedEnd ? formatDate(currentRevision.plannedEnd) : '—'} />
              </>
            )}
            <InfoBlock label="Version" value={`R${workOrder.currentRevisionNumber}`} />
            <InfoBlock label="Issued" value={currentRevision ? formatDate(currentRevision.issueDate) : '—'} />
          </div>

          {currentRevision && (
            <div className="grid grid-cols-2 gap-3">
              <a
                href={fileHref(currentRevision.id)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 rounded-2xl py-3.5 font-bold text-base min-h-[52px]"
                style={{ background: 'var(--ax-overlay)', color: 'var(--ax-text)', boxShadow: 'inset 0 0 0 1.5px var(--ax-border)' }}
              >
                <Eye className="w-5 h-5" /> View
              </a>
              <a
                href={fileHref(currentRevision.id, true)}
                className="flex items-center justify-center gap-2 rounded-2xl py-3.5 font-bold text-base min-h-[52px]"
                style={{ background: 'var(--ax-overlay)', color: 'var(--ax-text)', boxShadow: 'inset 0 0 0 1.5px var(--ax-border)' }}
              >
                <Download className="w-5 h-5" /> Save
              </a>
            </div>
          )}

          {canAct && (
            <div className="grid grid-cols-2 gap-3">
              <VendorActionButton
                label="Accept"
                loadingLabel="Accepting…"
                loading={accepting}
                disabled={rejecting}
                onClick={() => void handleAccept()}
                icon={CheckCircle2}
                variant="primary"
              />
              <VendorActionButton
                label="Not OK"
                disabled={accepting}
                onClick={() => { setShowReject(true); setError(''); }}
                icon={XCircle}
                variant="danger"
              />
            </div>
          )}

          {olderRevisions.length > 0 && (
            <div>
              <button
                onClick={() => setShowOlder((v) => !v)}
                className="w-full text-center text-base font-bold py-2.5"
                style={{ color: 'var(--ax-accent)' }}
              >
                {showOlder ? 'Hide' : 'Show'} Older Versions ({olderRevisions.length})
              </button>
              {showOlder && (
                <ul className="space-y-2 mt-2">
                  {olderRevisions.sort((a, b) => b.revisionNumber - a.revisionNumber).map((r) => (
                    <li key={r.id} className="flex items-center justify-between rounded-xl px-4 py-3.5" style={{ background: 'var(--ax-overlay)' }}>
                      <span className="font-semibold text-base" style={{ color: 'var(--ax-text)' }}>R{r.revisionNumber} · {formatDate(r.issueDate)}</span>
                      <a href={fileHref(r.id)} target="_blank" rel="noreferrer" className="text-base font-bold" style={{ color: 'var(--ax-accent)' }}>
                        View
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {showReject && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="rounded-[28px] max-w-md w-full p-6 space-y-4" style={{ background: 'var(--ax-card)', ...cardShadow }}>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={iconBadge('#ef4444')}>
                <XCircle className="w-5 h-5" style={{ color: '#ef4444' }} strokeWidth={2.25} />
              </div>
              <h2 className="text-xl font-bold" style={{ color: 'var(--ax-text)' }}>Why Not OK?</h2>
            </div>
            <textarea
              autoFocus
              rows={4}
              className="w-full rounded-2xl p-4 text-base"
              style={{ background: 'var(--ax-overlay)', color: 'var(--ax-text)', boxShadow: 'inset 0 0 0 1.5px var(--ax-border)' }}
              placeholder="Tell PMC what's wrong…"
              value={rejectRemarks}
              onChange={(e) => setRejectRemarks(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { setShowReject(false); setError(''); }}
                className="rounded-2xl py-3.5 font-bold text-base"
                style={{ background: 'var(--ax-overlay)', color: 'var(--ax-text)' }}
              >
                Cancel
              </button>
              <VendorActionButton
                label="Send"
                loadingLabel="Sending…"
                loading={rejecting}
                disabled={!rejectRemarks.trim()}
                onClick={() => void handleReject()}
                variant="danger"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-wide" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>{label}</p>
      <p className="text-xl font-bold mt-1" style={{ color: 'var(--ax-text)' }}>{value}</p>
    </div>
  );
}
