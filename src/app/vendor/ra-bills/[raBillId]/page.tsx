'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { Send, AlertTriangle, Save, Download, Check, FileText } from 'lucide-react';
import Layout from '@/components/Layout';
import VendorNav from '@/components/vendor/VendorNav';
import VendorActionButton from '@/components/vendor/VendorActionButton';
import { cardShadow } from '@/components/vendor/vendorTheme';
import { jsonFetcher } from '@/lib/fetcher';
import { formatCurrency, formatDate } from '@/lib/utils';

interface LineItem {
  id: string;
  description: string;
  unit: string;
  thisBillQty: number;
  rate: number;
  thisBillAmount: number;
}

interface MeasurementSheet {
  id: string;
  fileName: string;
  remarks: string | null;
  uploadedAt: string;
  uploadedBy: { name: string };
}

interface RABillDetail {
  id: string;
  billNumber: number;
  status: string;
  periodStart: string;
  periodEnd: string;
  submittedValue: number | null;
  siteEngineerReviewedAt: string | null;
  siteEngineerReviewedValue: number | null;
  siteEngineerReviewedBy: { name: string } | null;
  vendorAcceptedAt: string | null;
  certifiedAt: string | null;
  approvedValue: number | null;
  releasedValue: number | null;
  revisionReason: string | null;
  lineItems: LineItem[];
  order: { id: string; name: string };
  project: { id: string; name: string };
  measurementSheets: MeasurementSheet[];
  certifiedMeasurementSheet: MeasurementSheet | null;
}

/** Vendor's own bill — while it's still DRAFT or sent back for revision, quantities are
 * editable (this is the vendor's claim of what they executed); once Sent, it's read-only here
 * until PMC either certifies it or sends it back. */
export default function VendorRABillDetailPage() {
  const params = useParams();
  const raBillId = params.raBillId as string;

  const { data: bill, isLoading, mutate } = useSWR<RABillDetail>(
    `/api/vendor/ra-bills/${raBillId}`,
    jsonFetcher,
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [accepting, setAccepting] = useState(false);

  const handleAccept = async () => {
    setAccepting(true);
    setError('');
    try {
      const res = await fetch(`/api/vendor/ra-bills/${raBillId}/accept`, { method: 'POST' });
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

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/vendor/ra-bills/${raBillId}/submit`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        void mutate();
      } else {
        setError(data.error ?? 'Could not send. Try again.');
      }
    } catch {
      setError('Could not send. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveQty = async () => {
    if (!bill) return;
    const lineItems = Object.entries(qtyDraft).map(([lineItemId, qty]) => ({ lineItemId, thisBillQty: parseFloat(qty) || 0 }));
    if (lineItems.length === 0) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${bill.project.id}/orders/${bill.order.id}/ra-bills/${raBillId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineItems }),
      });
      const data = await res.json();
      if (data.success) {
        setQtyDraft({});
        void mutate();
      } else {
        setError(data.error ?? 'Could not save. Try again.');
      }
    } catch {
      setError('Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <p className="text-base" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>Loading…</p>
      </Layout>
    );
  }

  if (!bill) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto">
          <VendorNav title="Not Found" backHref="/vendor/ra-bills" />
        </div>
      </Layout>
    );
  }

  const canEditQty = bill.status === 'DRAFT' || bill.status === 'REVISION_REQUESTED';
  const canSubmit = canEditQty;
  const canAccept = !!bill.siteEngineerReviewedAt && !bill.vendorAcceptedAt;

  return (
    <Layout>
      <div className="max-w-lg mx-auto space-y-5">
        <VendorNav title={`RA-${bill.billNumber}`} backHref="/vendor/ra-bills" projectName={`${bill.order.name} · ${bill.project.name}`} />

        <a
          href={`/api/vendor/ra-bills/${raBillId}/pdf`}
          className="flex items-center justify-center gap-2 rounded-2xl py-3.5 font-bold text-base"
          style={{ background: 'var(--ax-overlay)', color: 'var(--ax-text)', boxShadow: 'inset 0 0 0 1.5px var(--ax-border)' }}
        >
          <Download className="w-5 h-5" /> Download RA Bill
        </a>

        {error && (
          <p className="text-base font-semibold rounded-2xl px-4 py-3" style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)' }}>{error}</p>
        )}

        {bill.status === 'REVISION_REQUESTED' && bill.revisionReason && (
          <div className="flex items-start gap-3 p-4 rounded-2xl" style={{ background: 'rgba(239,68,68,0.1)', boxShadow: 'inset 0 0 0 1.5px rgba(239,68,68,0.3)' }}>
            <AlertTriangle className="w-6 h-6 shrink-0 mt-0.5" style={{ color: '#ef4444' }} />
            <div>
              <p className="text-lg font-bold" style={{ color: '#ef4444' }}>Please Fix</p>
              <p className="text-base mt-0.5" style={{ color: 'rgba(239,68,68,0.85)' }}>{bill.revisionReason}</p>
            </div>
          </div>
        )}

        {bill.status === 'PENDING_SITE_ENGINEER_REVIEW' && (
          <div className="flex items-start gap-3 p-4 rounded-2xl" style={{ background: 'rgba(168,85,247,0.1)', boxShadow: 'inset 0 0 0 1.5px rgba(168,85,247,0.3)' }}>
            <p className="text-base font-semibold" style={{ color: '#a855f7' }}>With Site Engineer for review</p>
          </div>
        )}

        {canAccept && (
          <div className="p-4 rounded-2xl space-y-1" style={{ background: 'rgba(92,186,128,0.1)', boxShadow: 'inset 0 0 0 1.5px rgba(92,186,128,0.3)' }}>
            <p className="text-lg font-bold" style={{ color: '#5cba80' }}>
              Site Engineer{bill.siteEngineerReviewedBy ? ` (${bill.siteEngineerReviewedBy.name})` : ''} reviewed this bill
            </p>
            {bill.siteEngineerReviewedValue !== null && (
              <p className="text-base font-medium" style={{ color: 'rgba(92,186,128,0.85)' }}>Value: {formatCurrency(bill.siteEngineerReviewedValue)}</p>
            )}
            <p className="text-sm" style={{ color: 'rgba(92,186,128,0.7)' }}>Accept below to make this binding.</p>
          </div>
        )}

        {bill.vendorAcceptedAt && (
          <div className="flex items-start gap-3 p-4 rounded-2xl" style={{ background: 'rgba(92,186,128,0.1)', boxShadow: 'inset 0 0 0 1.5px rgba(92,186,128,0.3)' }}>
            <Check className="w-6 h-6 shrink-0 mt-0.5" style={{ color: '#5cba80' }} />
            <p className="text-base font-semibold" style={{ color: '#5cba80' }}>You accepted this bill on {formatDate(bill.vendorAcceptedAt)}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3.5">
          {[
            ['Submitted', bill.submittedValue !== null ? formatCurrency(bill.submittedValue) : '—'],
            ['Finished', bill.certifiedAt ? formatDate(bill.certifiedAt) : '—'],
            ['Approved', bill.approvedValue !== null ? formatCurrency(bill.approvedValue) : '—'],
            ['Paid', bill.releasedValue !== null ? formatCurrency(bill.releasedValue) : '—'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl p-4" style={{ background: 'var(--ax-card)', ...cardShadow }}>
              <p className="text-sm font-bold uppercase tracking-wide" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>{label}</p>
              <p className="text-3xl font-bold mt-1" style={{ color: 'var(--ax-text)' }}>{value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-[28px] p-6 space-y-3" style={{ background: 'var(--ax-card)', ...cardShadow }}>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold" style={{ color: 'var(--ax-text)' }}>Work Done</h2>
            {canEditQty && Object.keys(qtyDraft).length > 0 && (
              <button
                onClick={() => void handleSaveQty()}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 font-bold text-sm disabled:opacity-50"
                style={{ background: 'var(--ax-accent)', color: '#08150c' }}
              >
                <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>
          {bill.lineItems.map((li) => (
            <div key={li.id} className="rounded-2xl px-4 py-3.5 space-y-2" style={{ background: 'var(--ax-overlay)' }}>
              <p className="font-semibold text-base" style={{ color: 'var(--ax-text)' }}>{li.description}</p>
              {canEditQty ? (
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={qtyDraft[li.id] ?? li.thisBillQty}
                    onChange={(e) => setQtyDraft({ ...qtyDraft, [li.id]: e.target.value })}
                    className="flex-1 rounded-xl p-3 text-base font-bold text-right"
                    style={{ background: 'var(--ax-card)', color: 'var(--ax-text)' }}
                  />
                  <span className="text-sm font-medium shrink-0" style={{ color: 'rgba(var(--ax-text-rgb),0.5)' }}>{li.unit} × {formatCurrency(li.rate)}</span>
                </div>
              ) : (
                <div className="flex items-center justify-between text-base">
                  <span className="font-medium" style={{ color: 'rgba(var(--ax-text-rgb),0.5)' }}>{li.thisBillQty} {li.unit} × {formatCurrency(li.rate)}</span>
                  <span className="font-bold text-lg" style={{ color: 'var(--ax-text)' }}>{formatCurrency(li.thisBillAmount)}</span>
                </div>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: 'var(--ax-border-subtle)' }}>
            <span className="font-bold text-lg" style={{ color: 'var(--ax-text)' }}>Total</span>
            <span className="font-bold text-2xl" style={{ color: 'var(--ax-accent)' }}>
              {formatCurrency(bill.lineItems.reduce((sum, l) => sum + l.thisBillAmount, 0))}
            </span>
          </div>
        </div>

        {bill.measurementSheets.length > 0 && (
          <div className="rounded-[28px] p-6 space-y-3" style={{ background: 'var(--ax-card)', ...cardShadow }}>
            <h2 className="text-xl font-bold" style={{ color: 'var(--ax-text)' }}>Measurement Sheets</h2>
            {bill.measurementSheets.map((sheet) => (
              <a
                key={sheet.id}
                href={`/api/projects/${bill.project.id}/orders/${bill.order.id}/ra-bills/${raBillId}/measurement-sheets/${sheet.id}/file?download=1`}
                className="flex items-center gap-3 rounded-2xl px-4 py-3.5"
                style={{ background: 'var(--ax-overlay)' }}
              >
                <FileText className="w-5 h-5 shrink-0" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-base truncate" style={{ color: 'var(--ax-text)' }}>{sheet.fileName}</p>
                    {bill.certifiedMeasurementSheet?.id === sheet.id && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[rgba(56,189,248,0.15)] text-[#38bdf8] shrink-0">
                        Used for certification
                      </span>
                    )}
                  </div>
                  <p className="text-sm mt-0.5" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>
                    {sheet.uploadedBy.name} · {formatDate(sheet.uploadedAt)}{sheet.remarks ? ` · ${sheet.remarks}` : ''}
                  </p>
                </div>
                <Download className="w-4 h-4 shrink-0" style={{ color: 'rgba(var(--ax-text-rgb),0.35)' }} />
              </a>
            ))}
          </div>
        )}

        {canSubmit && (
          <VendorActionButton
            label="Send"
            loadingLabel="Sending…"
            loading={submitting}
            onClick={() => void handleSubmit()}
            icon={Send}
            variant="primary"
          />
        )}

        {canAccept && (
          <VendorActionButton
            label="Accept"
            loadingLabel="Accepting…"
            loading={accepting}
            onClick={() => void handleAccept()}
            icon={Check}
            variant="primary"
          />
        )}
      </div>
    </Layout>
  );
}
