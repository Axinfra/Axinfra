'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Download } from 'lucide-react';
import { TablePageSkeleton } from '@/components/ui/SkeletonPage';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';

interface LineItem {
  id: string;
  boqId: string;
  description: string;
  unit: string;
  contractedQty: number;
  rate: number;
  previousCumulativeQty: number;
  thisBillQty: number;
  thisBillAmount: number;
  cumulativeAmount: number;
  boq: { id: string; boqNumber: string | null; name: string | null };
}

interface RABillDetail {
  id: string;
  billNumber: number;
  periodStart: string;
  periodEnd: string;
  status: string;
  submittedValue: number | null;
  submittedAt: string | null;
  siteEngineerReviewedAt: string | null;
  siteEngineerReviewedValue: number | null;
  siteEngineerRemarks: string | null;
  vendorAcceptedAt: string | null;
  revisionRequestedAt: string | null;
  revisionReason: string | null;
  certifiedAt: string | null;
  certifiedRemarks: string | null;
  approvedValue: number | null;
  approvedAt: string | null;
  deductions: number;
  releasedValue: number | null;
  releasedAt: string | null;
  paymentReference: string | null;
  remarks: string | null;
  order: { id: string; name: string; vendorUserId: string | null };
  lineItems: LineItem[];
  createdBy: { name: string };
  submittedBy: { name: string } | null;
  siteEngineerReviewedBy: { name: string } | null;
  vendorAcceptedBy: { name: string } | null;
  revisionRequestedBy: { name: string } | null;
  certifiedBy: { name: string } | null;
  approvedBy: { name: string } | null;
  releasedBy: { name: string } | null;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    DRAFT: { cls: 'bg-[rgba(255,255,255,0.06)] text-[rgba(232,228,220,0.55)]', label: 'Draft' },
    PENDING_SITE_ENGINEER_REVIEW: { cls: 'bg-[rgba(168,85,247,0.15)] text-[#a855f7]', label: 'Pending Site Engineer Review' },
    PENDING_VENDOR_REVIEW: { cls: 'bg-[rgba(234,179,8,0.15)] text-[#eab308]', label: 'Pending Certification' },
    REVISION_REQUESTED: { cls: 'bg-[rgba(234,88,12,0.12)] text-[#f97316]', label: 'Needs Revision' },
    CERTIFIED: { cls: 'bg-[rgba(56,189,248,0.15)] text-[#38bdf8]', label: 'Certified' },
    APPROVED: { cls: 'bg-[rgba(92,186,128,0.15)] text-[#5cba80]', label: 'Approved' },
    PAID: { cls: 'badge-verified', label: 'Paid' },
  };
  const m = map[status] ?? map.DRAFT;
  if (status === 'PAID') return <span className="badge badge-verified">{m.label}</span>;
  return <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${m.cls}`}>{m.label}</span>;
}

function KPITile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] p-4">
      <p className="text-[11px] uppercase tracking-wider text-[rgba(232,228,220,0.4)]">{label}</p>
      <p className="text-xl font-semibold text-[#e8e4dc] mt-1">{value}</p>
    </div>
  );
}

export default function RABillDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const orderId = params.orderId as string;
  const raBillId = params.raBillId as string;

  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '';
  const myRole = project?.myRole ?? '';
  const myUserId = (project?.myUserId as string) ?? '';
  const permissions = (project?.permissions ?? {}) as Record<string, boolean>;

  const { data: bill, isLoading: billLoading, mutate: refetch } = useSWR<RABillDetail>(
    projectId && raBillId ? `/api/projects/${projectId}/orders/${orderId}/ra-bills/${raBillId}` : null,
    jsonFetcher,
  );

  const [error, setError] = useState('');
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});
  const [savingQty, setSavingQty] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionReasonInput, setRevisionReasonInput] = useState('');
  const [sendingRevision, setSendingRevision] = useState(false);

  const [showCertifyModal, setShowCertifyModal] = useState(false);
  const [certifyRemarks, setCertifyRemarks] = useState('');
  const [certifyFile, setCertifyFile] = useState<File | null>(null);
  const [certifying, setCertifying] = useState(false);

  const [showApproveModal, setShowApproveModal] = useState(false);
  const [deductionsInput, setDeductionsInput] = useState('0');
  const [approving, setApproving] = useState(false);

  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [releaseValueInput, setReleaseValueInput] = useState('');
  const [paymentReferenceInput, setPaymentReferenceInput] = useState('');
  const [releasing, setReleasing] = useState(false);

  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardRemarks, setForwardRemarks] = useState('');
  const [forwarding, setForwarding] = useState(false);

  const [accepting, setAccepting] = useState(false);

  const loading = projectLoading || billLoading;

  if (loading) {
    return (
      <Layout>
        <TablePageSkeleton />
      </Layout>
    );
  }

  if (!bill) {
    return (
      <Layout>
        <Navbar projectId={projectId} projectName={projectName} role={myRole} />
        <div className="card">
          <div className="card-body py-10 text-center">
            <p className="text-[rgba(232,228,220,0.55)]">RA Bill not found</p>
          </div>
        </div>
      </Layout>
    );
  }

  const isAssignedVendor = myRole === 'VENDOR' && bill.order.vendorUserId === myUserId;
  // canManage now means "can certify / send back for revision" (PMC or Consultant) — drafting
  // and editing quantities belongs to the assigned vendor, who's claiming what they executed.
  const canManage = permissions.canManageRABill;
  const canApprove = permissions.canApproveRABill;
  // Site Engineer sits between the vendor's submission and PMC's certification — reviews the
  // claimed quantities first and can edit them directly (the vendor has no say in this edit).
  const canSiteEngineerReview = permissions.canSiteEngineerReviewRABill && bill.status === 'PENDING_SITE_ENGINEER_REVIEW';
  const canEditQty =
    (isAssignedVendor && (bill.status === 'DRAFT' || bill.status === 'REVISION_REQUESTED')) || canSiteEngineerReview;
  const canSubmit = isAssignedVendor && bill.status === 'DRAFT';
  const canCertifyOrRevise = canManage && bill.status === 'PENDING_VENDOR_REVIEW';
  const canApproveNow = canApprove && bill.status === 'CERTIFIED';
  // Release payment is CLIENT or PMC only, deliberately narrower than canApprove (which now
  // also includes Site Engineer) — checked directly by role rather than reusing that flag.
  const canRelease = (myRole === 'CLIENT' || myRole === 'PMC') && bill.status === 'APPROVED';
  // The vendor's binding acknowledgement — available as soon as the Site Engineer has forwarded
  // the bill, regardless of how far it's progressed since (not gated on PMC/Client's steps).
  const canVendorAccept = isAssignedVendor && !!bill.siteEngineerReviewedAt && !bill.vendorAcceptedAt;

  const grossValue = bill.lineItems.reduce((sum, l) => sum + l.thisBillAmount, 0);

  const handleSaveQty = async () => {
    const lineItems = Object.entries(qtyDraft).map(([lineItemId, qty]) => ({ lineItemId, thisBillQty: parseFloat(qty) || 0 }));
    if (lineItems.length === 0) return;
    setSavingQty(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/orders/${orderId}/ra-bills/${raBillId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineItems }),
      });
      const data = await res.json();
      if (data.success) {
        setQtyDraft({});
        void refetch();
      } else {
        setError(data.error ?? 'Failed to save');
      }
    } catch {
      setError('Failed to save');
    } finally {
      setSavingQty(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/orders/${orderId}/ra-bills/${raBillId}/submit`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        void refetch();
      } else {
        setError(data.error ?? 'Failed to submit');
      }
    } catch {
      setError('Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestRevision = async () => {
    if (!revisionReasonInput.trim()) return;
    setSendingRevision(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/orders/${orderId}/ra-bills/${raBillId}/revision-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: revisionReasonInput.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setShowRevisionModal(false);
        setRevisionReasonInput('');
        void refetch();
      } else {
        setError(data.error ?? 'Failed to request revision');
      }
    } catch {
      setError('Failed to request revision');
    } finally {
      setSendingRevision(false);
    }
  };

  const handleCertify = async () => {
    setCertifying(true);
    setError('');
    try {
      let res: Response;
      if (certifyFile) {
        const formData = new FormData();
        formData.append('file', certifyFile);
        if (certifyRemarks.trim()) formData.append('remarks', certifyRemarks.trim());
        res = await fetch(`/api/projects/${projectId}/orders/${orderId}/ra-bills/${raBillId}/certify`, { method: 'POST', body: formData });
      } else {
        res = await fetch(`/api/projects/${projectId}/orders/${orderId}/ra-bills/${raBillId}/certify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ remarks: certifyRemarks.trim() || undefined }),
        });
      }
      const data = await res.json();
      if (data.success) {
        setShowCertifyModal(false);
        setCertifyRemarks('');
        setCertifyFile(null);
        void refetch();
      } else {
        setError(data.error ?? 'Failed to certify');
      }
    } catch {
      setError('Failed to certify');
    } finally {
      setCertifying(false);
    }
  };

  const handleForward = async () => {
    setForwarding(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/orders/${orderId}/ra-bills/${raBillId}/forward-to-pmc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remarks: forwardRemarks.trim() || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        setShowForwardModal(false);
        setForwardRemarks('');
        void refetch();
      } else {
        setError(data.error ?? 'Failed to forward to PMC');
      }
    } catch {
      setError('Failed to forward to PMC');
    } finally {
      setForwarding(false);
    }
  };

  const handleAccept = async () => {
    setAccepting(true);
    setError('');
    try {
      const res = await fetch(`/api/vendor/ra-bills/${raBillId}/accept`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        void refetch();
      } else {
        setError(data.error ?? 'Failed to accept');
      }
    } catch {
      setError('Failed to accept');
    } finally {
      setAccepting(false);
    }
  };

  const handleApprove = async () => {
    setApproving(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/orders/${orderId}/ra-bills/${raBillId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deductions: parseFloat(deductionsInput) || 0 }),
      });
      const data = await res.json();
      if (data.success) {
        setShowApproveModal(false);
        void refetch();
      } else {
        setError(data.error ?? 'Failed to approve');
      }
    } catch {
      setError('Failed to approve');
    } finally {
      setApproving(false);
    }
  };

  const handleRelease = async () => {
    setReleasing(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/orders/${orderId}/ra-bills/${raBillId}/release-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          releasedValue: releaseValueInput ? parseFloat(releaseValueInput) : undefined,
          paymentReference: paymentReferenceInput.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowReleaseModal(false);
        void refetch();
      } else {
        setError(data.error ?? 'Failed to release payment');
      }
    } catch {
      setError('Failed to release payment');
    } finally {
      setReleasing(false);
    }
  };

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6">
        <div className="flex justify-between items-start flex-wrap gap-3">
          <div>
            <button
              onClick={() => router.push(`/projects/${projectId}/orders/${orderId}`)}
              className="text-xs text-[rgba(232,228,220,0.45)] hover:text-[var(--ax-accent)] transition-colors mb-1"
            >
              ← Back to {bill.order.name}
            </button>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-[#e8e4dc]">RA-{bill.billNumber}</h1>
              <StatusBadge status={bill.status} />
            </div>
            <p className="text-xs text-[rgba(232,228,220,0.4)] mt-1">
              Period: {formatDate(bill.periodStart)} – {formatDate(bill.periodEnd)}
            </p>
          </div>
          <a
            href={`/api/projects/${projectId}/orders/${orderId}/ra-bills/${raBillId}/pdf`}
            className="btn btn-secondary text-sm inline-flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" /> Download RA Bill
          </a>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {bill.status === 'REVISION_REQUESTED' && bill.revisionReason && (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-[rgba(234,88,12,0.08)] border border-[rgba(249,115,22,0.25)]">
            <span className="text-[#f97316] text-lg leading-none mt-0.5">⚠</span>
            <div>
              <p className="text-sm font-medium text-[#f97316]">Revision Requested{bill.revisionRequestedBy ? ` by ${bill.revisionRequestedBy.name}` : ''}</p>
              <p className="text-xs text-[rgba(249,115,22,0.7)] mt-0.5">{bill.revisionReason}</p>
            </div>
          </div>
        )}

        {canSiteEngineerReview && (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-[rgba(168,85,247,0.08)] border border-[rgba(168,85,247,0.25)]">
            <span className="text-[#a855f7] text-lg leading-none mt-0.5">✎</span>
            <div>
              <p className="text-sm font-medium text-[#a855f7]">Your review — check quantities before PMC sees this bill</p>
              <p className="text-xs text-[rgba(168,85,247,0.75)] mt-0.5">
                Edit any incorrect quantities below, then Forward to PMC. The vendor gets a read-only copy of your figures to accept.
              </p>
            </div>
          </div>
        )}

        {bill.status === 'PENDING_SITE_ENGINEER_REVIEW' && !canSiteEngineerReview && (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-[rgba(168,85,247,0.08)] border border-[rgba(168,85,247,0.25)]">
            <span className="text-[#a855f7] text-lg leading-none mt-0.5">⏳</span>
            <p className="text-sm text-[rgba(168,85,247,0.85)]">Awaiting Site Engineer review before this reaches PMC.</p>
          </div>
        )}

        {canVendorAccept && (
          <div className="flex items-start justify-between gap-3 p-4 rounded-lg bg-[rgba(92,186,128,0.08)] border border-[rgba(92,186,128,0.25)] flex-wrap">
            <div>
              <p className="text-sm font-medium text-[#5cba80]">
                Site Engineer{bill.siteEngineerReviewedBy ? ` (${bill.siteEngineerReviewedBy.name})` : ''} reviewed this bill
                {bill.siteEngineerReviewedValue !== null ? ` — value ${formatCurrency(bill.siteEngineerReviewedValue)}` : ''}.
              </p>
              <p className="text-xs text-[rgba(92,186,128,0.75)] mt-0.5">Accept to make these figures binding.</p>
            </div>
            <button onClick={() => void handleAccept()} disabled={accepting} className="btn btn-success text-sm disabled:opacity-50">
              {accepting ? 'Accepting…' : 'Accept'}
            </button>
          </div>
        )}

        {isAssignedVendor && bill.vendorAcceptedAt && (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-[rgba(92,186,128,0.08)] border border-[rgba(92,186,128,0.25)]">
            <span className="text-[#5cba80] text-lg leading-none mt-0.5">✓</span>
            <p className="text-sm text-[rgba(92,186,128,0.85)]">You accepted this bill on {formatDate(bill.vendorAcceptedAt)}.</p>
          </div>
        )}

        {/* Headline KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KPITile label="Submitted Value" value={bill.submittedValue !== null ? formatCurrency(bill.submittedValue) : '—'} />
          <KPITile label="Finished When" value={bill.certifiedAt ? formatDate(bill.certifiedAt) : '—'} />
          <KPITile label="Approved Value" value={bill.approvedValue !== null ? formatCurrency(bill.approvedValue) : '—'} />
          <KPITile label="Released Value" value={bill.releasedValue !== null ? formatCurrency(bill.releasedValue) : '—'} />
        </div>

        {/* Line items */}
        <div className="card">
          <div className="card-header flex justify-between items-center">
            <h2 className="text-lg font-semibold">BOQ-wise Progress</h2>
            {canEditQty && Object.keys(qtyDraft).length > 0 && (
              <button onClick={() => void handleSaveQty()} disabled={savingQty} className="btn btn-sm btn-primary text-xs disabled:opacity-50">
                {savingQty ? 'Saving…' : 'Save Quantities'}
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="table text-sm">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Unit</th>
                  <th className="text-right">Contracted Qty</th>
                  <th className="text-right">Previous Cum. Qty</th>
                  <th className="text-right">This Bill Qty</th>
                  <th className="text-right">Rate</th>
                  <th className="text-right">This Bill Amount</th>
                  <th className="text-right">Cumulative Amount</th>
                </tr>
              </thead>
              <tbody>
                {bill.lineItems.map((li) => (
                  <tr key={li.id}>
                    <td>{li.description}</td>
                    <td>{li.unit}</td>
                    <td className="text-right">{li.contractedQty}</td>
                    <td className="text-right">{li.previousCumulativeQty}</td>
                    <td className="text-right">
                      {canEditQty ? (
                        <input
                          type="number"
                          className="input py-1 text-sm w-24 text-right"
                          value={qtyDraft[li.id] ?? li.thisBillQty}
                          onChange={(e) => setQtyDraft({ ...qtyDraft, [li.id]: e.target.value })}
                        />
                      ) : (
                        li.thisBillQty
                      )}
                    </td>
                    <td className="text-right">{formatCurrency(li.rate)}</td>
                    <td className="text-right font-medium">{formatCurrency(li.thisBillAmount)}</td>
                    <td className="text-right">{formatCurrency(li.cumulativeAmount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[rgba(255,255,255,0.03)] font-semibold">
                  <td colSpan={6} className="text-right">Gross Value</td>
                  <td className="text-right">{formatCurrency(grossValue)}</td>
                  <td />
                </tr>
                {bill.status !== 'DRAFT' && bill.status !== 'PENDING_VENDOR_REVIEW' && bill.status !== 'REVISION_REQUESTED' && (
                  <tr className="bg-[rgba(255,255,255,0.03)] text-[rgba(232,228,220,0.65)]">
                    <td colSpan={6} className="text-right">Deductions</td>
                    <td className="text-right">– {formatCurrency(bill.deductions)}</td>
                    <td />
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        </div>

        {(bill.certifiedRemarks || bill.remarks || bill.paymentReference) && (
          <div className="card">
            <div className="card-body space-y-2 text-sm">
              {bill.remarks && <p><span className="text-[rgba(232,228,220,0.45)]">Remarks:</span> {bill.remarks}</p>}
              {bill.certifiedRemarks && <p><span className="text-[rgba(232,228,220,0.45)]">Certification Remarks:</span> {bill.certifiedRemarks}</p>}
              {bill.paymentReference && <p><span className="text-[rgba(232,228,220,0.45)]">Payment Reference:</span> {bill.paymentReference}</p>}
            </div>
          </div>
        )}

        {/* Workflow actions */}
        <div className="flex justify-end gap-3 flex-wrap">
          {canSubmit && (
            <button onClick={() => void handleSubmit()} disabled={submitting} className="btn btn-primary disabled:opacity-50">
              {submitting ? 'Submitting…' : 'Submit for Review'}
            </button>
          )}
          {canSiteEngineerReview && (
            <button onClick={() => setShowForwardModal(true)} className="btn text-white bg-[#a855f7] hover:bg-[#9333ea]">
              Forward to PMC
            </button>
          )}
          {canCertifyOrRevise && (
            <>
              <button onClick={() => setShowRevisionModal(true)} className="btn btn-secondary">Request Revision</button>
              <button onClick={() => setShowCertifyModal(true)} className="btn btn-primary">Certify</button>
            </>
          )}
          {canApproveNow && (
            <button onClick={() => { setDeductionsInput(String(bill.deductions ?? 0)); setShowApproveModal(true); }} className="btn btn-success">
              Approve for Payment
            </button>
          )}
          {canRelease && (
            <button
              onClick={() => { setReleaseValueInput(String(bill.approvedValue ?? '')); setShowReleaseModal(true); }}
              className="btn btn-success"
            >
              Release Payment
            </button>
          )}
        </div>

        {/* Approval trail */}
        <div className="card">
          <div className="card-header"><h2 className="text-lg font-semibold">Approval Trail</h2></div>
          <div className="card-body space-y-2 text-sm">
            <p><span className="text-[rgba(232,228,220,0.45)]">Drafted by</span> {bill.createdBy.name}</p>
            {bill.submittedBy && <p><span className="text-[rgba(232,228,220,0.45)]">Submitted by</span> {bill.submittedBy.name}{bill.submittedAt ? ` on ${formatDate(bill.submittedAt)}` : ''}</p>}
            {bill.siteEngineerReviewedBy && <p><span className="text-[rgba(232,228,220,0.45)]">Reviewed by Site Engineer</span> {bill.siteEngineerReviewedBy.name}{bill.siteEngineerReviewedAt ? ` on ${formatDate(bill.siteEngineerReviewedAt)}` : ''}</p>}
            {bill.vendorAcceptedBy && <p><span className="text-[rgba(232,228,220,0.45)]">Accepted by Vendor</span> {bill.vendorAcceptedBy.name}{bill.vendorAcceptedAt ? ` on ${formatDate(bill.vendorAcceptedAt)}` : ''}</p>}
            {bill.certifiedBy && <p><span className="text-[rgba(232,228,220,0.45)]">Certified by</span> {bill.certifiedBy.name}{bill.certifiedAt ? ` on ${formatDate(bill.certifiedAt)}` : ''}</p>}
            {bill.approvedBy && <p><span className="text-[rgba(232,228,220,0.45)]">Approved by</span> {bill.approvedBy.name}{bill.approvedAt ? ` on ${formatDate(bill.approvedAt)}` : ''}</p>}
            {bill.releasedBy && <p><span className="text-[rgba(232,228,220,0.45)]">Payment released by</span> {bill.releasedBy.name}{bill.releasedAt ? ` on ${formatDate(bill.releasedAt)}` : ''}</p>}
          </div>
        </div>
      </div>

      {/* Request Revision modal */}
      {showRevisionModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-md w-full">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-1 text-[#f97316]">Request Revision</h2>
              <p className="text-sm text-[rgba(232,228,220,0.55)] mb-4">Describe what needs to be corrected. The vendor will see this message.</p>
              <textarea
                autoFocus rows={4} className="input resize-none w-full"
                placeholder="e.g. Quantity for item 2 exceeds contracted qty…"
                value={revisionReasonInput} onChange={(e) => setRevisionReasonInput(e.target.value)}
              />
              <div className="flex justify-end gap-3 mt-4">
                <button onClick={() => setShowRevisionModal(false)} className="btn btn-secondary">Cancel</button>
                <button
                  onClick={() => void handleRequestRevision()}
                  disabled={sendingRevision || !revisionReasonInput.trim()}
                  className="btn bg-[#f97316] text-white hover:bg-[#ea7011] disabled:opacity-50"
                >
                  {sendingRevision ? 'Sending…' : 'Send for Revision'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Forward to PMC modal */}
      {showForwardModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-md w-full">
            <div className="p-6 space-y-4">
              <h2 className="text-lg font-semibold text-[#e8e4dc]">Forward to PMC</h2>
              <p className="text-sm text-[rgba(232,228,220,0.55)]">
                Sends this bill to PMC for certification. The vendor also gets a read-only copy of your figures to accept.
              </p>
              <div>
                <label className="label text-xs">Remarks (optional)</label>
                <textarea rows={2} className="input text-sm resize-none" placeholder="e.g. Adjusted item 3 qty down to match site measurement." value={forwardRemarks} onChange={(e) => setForwardRemarks(e.target.value)} />
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t border-[rgba(255,255,255,0.07)]">
                <button onClick={() => setShowForwardModal(false)} className="btn btn-secondary">Cancel</button>
                <button
                  onClick={() => void handleForward()}
                  disabled={forwarding}
                  className="btn text-white bg-[#a855f7] hover:bg-[#9333ea] disabled:opacity-50"
                >
                  {forwarding ? 'Forwarding…' : 'Forward to PMC'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Certify modal */}
      {showCertifyModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-md w-full">
            <div className="p-6 space-y-4">
              <h2 className="text-lg font-semibold text-[#e8e4dc]">Certify Measured Quantities</h2>
              <p className="text-sm text-[rgba(232,228,220,0.55)]">
                Confirms the this-period quantities are measured/executed as billed. Optionally attach a signed measurement sheet.
              </p>
              <div>
                <label className="label text-xs">Measurement Sheet (optional)</label>
                <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp" onChange={(e) => setCertifyFile(e.target.files?.[0] ?? null)} className="input text-sm" />
              </div>
              <div>
                <label className="label text-xs">Remarks (optional)</label>
                <textarea rows={2} className="input text-sm resize-none" placeholder="e.g. Measured on site against as-built survey — matches claim." value={certifyRemarks} onChange={(e) => setCertifyRemarks(e.target.value)} />
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t border-[rgba(255,255,255,0.07)]">
                <button onClick={() => setShowCertifyModal(false)} className="btn btn-secondary">Cancel</button>
                <button onClick={() => void handleCertify()} disabled={certifying} className="btn btn-primary disabled:opacity-50">
                  {certifying ? 'Certifying…' : 'Certify'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Approve modal */}
      {showApproveModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-sm w-full">
            <div className="p-6 space-y-4">
              <h2 className="text-base font-semibold text-[#e8e4dc]">Approve RA-{bill.billNumber} for Payment</h2>
              <p className="text-sm text-[rgba(232,228,220,0.55)]">Gross value: {formatCurrency(grossValue)}</p>
              <div>
                <label className="label text-xs">Deductions (retention / TDS / advance recovery)</label>
                <input type="number" className="input text-sm" placeholder="0" value={deductionsInput} onChange={(e) => setDeductionsInput(e.target.value)} />
              </div>
              <p className="text-sm text-[#5cba80] font-medium">
                Net payable: {formatCurrency(grossValue - (parseFloat(deductionsInput) || 0))}
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowApproveModal(false)} className="btn btn-secondary">Cancel</button>
                <button onClick={() => void handleApprove()} disabled={approving} className="btn btn-success disabled:opacity-50">
                  {approving ? 'Approving…' : 'Approve'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Release payment modal */}
      {showReleaseModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-sm w-full">
            <div className="p-6 space-y-4">
              <h2 className="text-base font-semibold text-[#e8e4dc]">Release Payment</h2>
              <div>
                <label className="label text-xs">Amount</label>
                <input type="number" className="input text-sm" placeholder={String(bill.approvedValue ?? 0)} value={releaseValueInput} onChange={(e) => setReleaseValueInput(e.target.value)} />
                <p className="text-xs text-[rgba(232,228,220,0.35)] mt-1">Defaults to the full approved value — enter a smaller amount for a partial release.</p>
              </div>
              <div>
                <label className="label text-xs">Payment Reference (optional)</label>
                <input type="text" className="input text-sm" placeholder="UTR / cheque number" value={paymentReferenceInput} onChange={(e) => setPaymentReferenceInput(e.target.value)} />
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowReleaseModal(false)} className="btn btn-secondary">Cancel</button>
                <button onClick={() => void handleRelease()} disabled={releasing} className="btn btn-success disabled:opacity-50">
                  {releasing ? 'Releasing…' : 'Release Payment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
