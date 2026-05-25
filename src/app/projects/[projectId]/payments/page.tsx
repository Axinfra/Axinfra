'use client';

import { ListPageSkeleton } from '@/components/ui/SkeletonPage';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import MilestoneStateBadge from '@/components/MilestoneStateBadge';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { BlockingReasonLabels } from '@/types';
import { useProject } from '@/lib/contexts/ProjectContext';

interface PaymentEligibilityItem {
  id: string;
  state: string;
  eligibleAmount: number;
  blockedAmount: number;
  dueDate: string | null;
  blockReasonCode?: string;
  blockExplanation?: string;
  blockedAt?: string;
  markedPaidAt?: string;
  paidExplanation?: string;
  milestone: {
    id: string;
    title: string;
    paymentModel: string;
    state: string;
  };
  events: Array<{
    eventType: string;
    fromState?: string;
    toState: string;
    explanation?: string;
    createdAt: string;
    actor: { name: string };
  }>;
}

type ModalType = 'confirmPaid' | 'notDone' | 'block' | 'unblock' | null;

export default function PaymentsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [error, setError] = useState('');

  const [activeItem, setActiveItem] = useState<PaymentEligibilityItem | null>(null);
  const [modalType, setModalType] = useState<ModalType>(null);
  const [reasonCode, setReasonCode] = useState('QUALITY_ISSUE');
  const [explanation, setExplanation] = useState('');
  const [processing, setProcessing] = useState(false);

  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '';
  const myRole = project?.myRole ?? '';
  const permissions = (project?.permissions ?? {}) as Record<string, boolean>;
  const projectMilestones = ((project as any)?.milestones ?? []) as Array<{
    id: string;
    paymentEligibility?: unknown;
  }>;

  const eligibleMilestoneIds = projectMilestones
    .filter((m) => m.paymentEligibility)
    .map((m) => m.id);
  const swrKey = projectId && eligibleMilestoneIds.length > 0
    ? ['payments', projectId, eligibleMilestoneIds.join(',')]
    : null;

  const {
    data: eligibilityItems = [],
    isLoading: paymentsLoading,
    mutate: refetchPayments,
  } = useSWR<PaymentEligibilityItem[]>(
    swrKey,
    async () => {
      const results = await Promise.all(
        eligibleMilestoneIds.map(async (id) => {
          try {
            const res = await fetch(`/api/projects/${projectId}/milestones/${id}/payment`);
            const data = await res.json();
            return data.success ? (data.data as PaymentEligibilityItem) : null;
          } catch { return null; }
        }),
      );
      return results.filter((r): r is PaymentEligibilityItem => r !== null);
    },
    { revalidateOnFocus: true, dedupingInterval: 5_000 },
  );

  const loading = projectLoading || paymentsLoading;

  const openModal = (item: PaymentEligibilityItem, type: ModalType) => {
    setActiveItem(item);
    setModalType(type);
    setExplanation('');
    setError('');
  };

  const closeModal = () => {
    setActiveItem(null);
    setModalType(null);
    setExplanation('');
    setError('');
  };

  const handleAction = async () => {
    if (!activeItem || !modalType) return;
    // Reason is only required for notDone / block / unblock — not for confirming payment
    if (modalType !== 'confirmPaid' && !explanation.trim()) {
      setError('Please provide a reason');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const body: Record<string, unknown> = { explanation: explanation.trim() || 'Payment confirmed' };

      if (modalType === 'confirmPaid') {
        body.action = 'markPaid';
      } else if (modalType === 'notDone') {
        body.action = 'block';
        body.reasonCode = reasonCode;
      } else if (modalType === 'block') {
        body.action = 'block';
        body.reasonCode = reasonCode;
      } else if (modalType === 'unblock') {
        body.action = 'unblock';
        body.reason = explanation;
      }

      const res = await fetch(
        `/api/projects/${projectId}/milestones/${activeItem.milestone.id}/payment/mark`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      );
      const data = await res.json();

      if (data.success) {
        closeModal();
        void refetchPayments();
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to process action');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <Layout><ListPageSkeleton /></Layout>;

  const ELIGIBLE_STATES = ['PARTIALLY_ELIGIBLE', 'FULLY_ELIGIBLE'];
  const isOwner = myRole === 'OWNER';

  // Split into sections
  const pendingPayment = eligibilityItems.filter((p) => ELIGIBLE_STATES.includes(p.state));
  const notDoneItems = eligibilityItems.filter((p) => p.state === 'BLOCKED');
  const paidItems = eligibilityItems.filter((p) => p.state === 'MARKED_PAID');
  const closedItems = eligibilityItems.filter((p) =>
    !ELIGIBLE_STATES.includes(p.state) && p.state !== 'BLOCKED' && p.state !== 'MARKED_PAID'
  );

  const totalPending = pendingPayment.reduce((s, p) => s + p.eligibleAmount, 0);
  const totalPaid = paidItems.reduce((s, p) => s + p.eligibleAmount, 0);

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold text-[#e8e4dc]">Payments</h1>
          <p className="text-sm text-[rgba(232,228,220,0.5)] mt-1">
            Review verified milestones and confirm or defer payment release.
          </p>
        </div>

        {/* Summary */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="card">
            <div className="card-body">
              <p className="text-xs text-[rgba(232,228,220,0.45)] uppercase tracking-wider">Pending Release</p>
              <p className="text-2xl font-bold text-[#c4a35a] mt-1">{formatCurrency(totalPending)}</p>
              <p className="text-xs text-[rgba(232,228,220,0.4)] mt-0.5">{pendingPayment.length} milestone{pendingPayment.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <p className="text-xs text-[rgba(232,228,220,0.45)] uppercase tracking-wider">Released</p>
              <p className="text-2xl font-bold text-[#5cba80] mt-1">{formatCurrency(totalPaid)}</p>
              <p className="text-xs text-[rgba(232,228,220,0.4)] mt-0.5">{paidItems.length} milestone{paidItems.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <p className="text-xs text-[rgba(232,228,220,0.45)] uppercase tracking-wider">Not Done</p>
              <p className="text-2xl font-bold text-[#e06050] mt-1">{notDoneItems.length}</p>
              <p className="text-xs text-[rgba(232,228,220,0.4)] mt-0.5">pending review</p>
            </div>
          </div>
        </div>

        {/* Pending Payment — Owner Action Required */}
        {pendingPayment.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-base font-semibold text-[#e8e4dc]">
              Awaiting Payment Confirmation
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-[rgba(196,163,90,0.15)] text-[#c4a35a]">
                {pendingPayment.length}
              </span>
            </h2>

            {pendingPayment.map((item) => (
              <div key={item.id} className="card border-[rgba(196,163,90,0.2)]">
                <div className="card-body space-y-4">
                  {/* Milestone info */}
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-base font-semibold text-[#e8e4dc]">{item.milestone.title}</p>
                      <p className="text-xs text-[rgba(232,228,220,0.45)] mt-0.5">
                        {item.milestone.paymentModel.replace('_', ' ')} · <MilestoneStateBadge state={item.milestone.state as any} />
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xl font-bold text-[#c4a35a]">{formatCurrency(item.eligibleAmount)}</p>
                      <p className="text-xs text-[rgba(232,228,220,0.4)]">eligible for release</p>
                    </div>
                  </div>

                  {/* Two action cards */}
                  {isOwner && (
                    <div className="grid sm:grid-cols-2 gap-3 pt-1">
                      {/* Confirm Payment */}
                      <button
                        onClick={() => openModal(item, 'confirmPaid')}
                        className="flex items-center gap-3 p-4 rounded-xl border border-[rgba(92,186,128,0.3)] bg-[rgba(92,186,128,0.06)] hover:bg-[rgba(92,186,128,0.12)] transition-colors text-left"
                      >
                        <div className="w-9 h-9 rounded-full bg-[rgba(92,186,128,0.15)] flex items-center justify-center shrink-0">
                          <span className="text-[#5cba80] text-lg">✓</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[#5cba80]">Confirm Payment</p>
                          <p className="text-xs text-[rgba(232,228,220,0.45)] mt-0.5">Release payment · close milestone</p>
                        </div>
                      </button>

                      {/* Not Done */}
                      <button
                        onClick={() => openModal(item, 'notDone')}
                        className="flex items-center gap-3 p-4 rounded-xl border border-[rgba(224,96,80,0.3)] bg-[rgba(224,96,80,0.06)] hover:bg-[rgba(224,96,80,0.12)] transition-colors text-left"
                      >
                        <div className="w-9 h-9 rounded-full bg-[rgba(224,96,80,0.15)] flex items-center justify-center shrink-0">
                          <span className="text-[#e06050] text-lg">✕</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[#e06050]">Not Done</p>
                          <p className="text-xs text-[rgba(232,228,220,0.45)] mt-0.5">Defer payment · notify PMC & Vendor</p>
                        </div>
                      </button>
                    </div>
                  )}

                  {/* PMC view — read only */}
                  {!isOwner && permissions.canMarkPaid && (
                    <div className="flex gap-2">
                      <button onClick={() => openModal(item, 'block')} className="btn btn-secondary text-sm">
                        Block Payment
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Not Done / Blocked */}
        {notDoneItems.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-base font-semibold text-[#e8e4dc]">Payment Not Done</h2>
            {notDoneItems.map((item) => (
              <div key={item.id} className="card border-[rgba(224,96,80,0.2)]">
                <div className="card-body space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-base font-semibold text-[#e8e4dc]">{item.milestone.title}</p>
                      {item.blockReasonCode && (
                        <p className="text-xs text-[#e06050] mt-0.5">
                          {BlockingReasonLabels[item.blockReasonCode as keyof typeof BlockingReasonLabels]}
                        </p>
                      )}
                      {item.blockExplanation && (
                        <p className="text-sm text-[rgba(232,228,220,0.55)] mt-1 italic">"{item.blockExplanation}"</p>
                      )}
                      {item.blockedAt && (
                        <p className="text-xs text-[rgba(232,228,220,0.35)] mt-1">{formatDateTime(item.blockedAt)}</p>
                      )}
                    </div>
                    <p className="text-lg font-bold text-[#e06050] shrink-0">{formatCurrency(item.blockedAmount)}</p>
                  </div>
                  {isOwner && permissions.canUnblockPayment && (
                    <button onClick={() => openModal(item, 'unblock')} className="btn btn-secondary text-sm w-fit">
                      Resume Payment
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Released / Paid */}
        {paidItems.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-base font-semibold text-[#e8e4dc]">Released</h2>
            {paidItems.map((item) => (
              <div key={item.id} className="card border-[rgba(92,186,128,0.15)]">
                <div className="card-body">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-base font-semibold text-[#e8e4dc]">{item.milestone.title}</p>
                      {item.paidExplanation && (
                        <p className="text-xs text-[rgba(232,228,220,0.45)] mt-0.5">Ref: {item.paidExplanation}</p>
                      )}
                      {item.markedPaidAt && (
                        <p className="text-xs text-[rgba(232,228,220,0.35)] mt-0.5">{formatDateTime(item.markedPaidAt)}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[rgba(92,186,128,0.12)] text-[#5cba80]">
                        Released
                      </span>
                      <p className="text-lg font-bold text-[#5cba80]">{formatCurrency(item.eligibleAmount)}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* No items */}
        {eligibilityItems.length === 0 && (
          <div className="card">
            <div className="card-body text-center py-12">
              <p className="text-[rgba(232,228,220,0.4)]">No payment records yet. They appear once a milestone is verified by PMC.</p>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {activeItem && modalType && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-md w-full shadow-2xl">
            <div className="p-6 space-y-5">
              {/* Modal header */}
              <div>
                <h2 className="text-lg font-semibold text-[#e8e4dc]">
                  {modalType === 'confirmPaid' && 'Confirm Payment Release'}
                  {modalType === 'notDone' && 'Mark Payment as Not Done'}
                  {modalType === 'block' && 'Block Payment'}
                  {modalType === 'unblock' && 'Resume Payment'}
                </h2>
                <p className="text-sm text-[rgba(232,228,220,0.5)] mt-1">
                  {activeItem.milestone.title} · {formatCurrency(activeItem.eligibleAmount)}
                </p>
              </div>

              {error && <div className="alert alert-error text-sm">{error}</div>}

              {/* Reason code for block / not done */}
              {(modalType === 'block' || modalType === 'notDone') && (
                <div>
                  <label className="label text-xs">Reason</label>
                  <select className="input text-sm" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
                    {Object.entries(BlockingReasonLabels).map(([code, label]) => (
                      <option key={code} value={code}>{label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Reason — only for not-done / block / unblock */}
              {modalType !== 'confirmPaid' && (
                <div>
                  <label className="label text-xs">
                    Reason <span className="text-[#e06050]">*</span>
                  </label>
                  <textarea
                    className="input resize-none text-sm"
                    rows={3}
                    value={explanation}
                    onChange={(e) => setExplanation(e.target.value)}
                    placeholder={
                      modalType === 'notDone'
                        ? 'Explain why payment is not being released now…'
                        : modalType === 'unblock'
                        ? 'Reason for resuming payment…'
                        : 'Reason for blocking…'
                    }
                  />
                </div>
              )}

              {/* Warning for not done */}
              {modalType === 'notDone' && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-[rgba(224,96,80,0.06)] border border-[rgba(224,96,80,0.15)]">
                  <span className="text-[#e06050] shrink-0">⚠</span>
                  <p className="text-xs text-[rgba(232,228,220,0.6)]">
                    PMC and Vendor will be notified with your reason. You can resume payment later.
                  </p>
                </div>
              )}

              {/* Confirmation note for paid */}
              {modalType === 'confirmPaid' && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-[rgba(92,186,128,0.06)] border border-[rgba(92,186,128,0.15)]">
                  <span className="text-[#5cba80] shrink-0">✓</span>
                  <p className="text-xs text-[rgba(232,228,220,0.6)]">
                    Payment will be marked as released and the milestone will be closed. Vendor and PMC will be notified.
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={closeModal} className="btn btn-secondary">Cancel</button>
                <button
                  onClick={handleAction}
                  disabled={processing}
                  className={`btn disabled:opacity-50 ${
                    modalType === 'confirmPaid' ? 'btn-success' :
                    modalType === 'notDone' || modalType === 'block' ? 'bg-[rgba(224,96,80,0.15)] text-[#e06050] border border-[rgba(224,96,80,0.3)] hover:bg-[rgba(224,96,80,0.25)]' :
                    'btn-primary'
                  }`}
                >
                  {processing ? 'Processing…' : (
                    modalType === 'confirmPaid' ? 'Confirm & Release' :
                    modalType === 'notDone' ? 'Mark Not Done & Notify' :
                    modalType === 'unblock' ? 'Resume Payment' :
                    'Block Payment'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
