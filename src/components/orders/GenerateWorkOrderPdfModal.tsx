'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, FileDown, Sparkles } from 'lucide-react';
import useSWR from 'swr';
import { jsonFetcher } from '@/lib/fetcher';
import { emptyPdfDetails, type WorkOrderPdfDetails } from '@/lib/pdf/types';

interface RoleEntry {
  userId: string | null;
  name: string;
  role: string;
  isPendingInvite: boolean;
}

interface BoqItem {
  id: string;
  description: string;
  unit: string;
  plannedQty: number;
  rate: number;
  plannedValue: number;
}

interface Revision {
  revisionNumber: number;
  issueDate: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  pdfDetailsJson?: string | null;
}

interface WorkOrder {
  id: string;
  number: string;
  currentRevisionNumber: number;
  revisions: Revision[];
}

type Mode = 'download' | 'revise' | 'issue';

const currencyFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

function roleNames(roles: RoleEntry[] | undefined, role: string): string {
  if (!roles) return '';
  return roles.filter((r) => r.role === role && !r.isPendingInvite).map((r) => r.name).join(', ');
}

/** Generates a professional Work Order PDF from live project/vendor/BOQ data. Collects the
 * narrative/terms/signatory fields the DB doesn't have, then either just downloads the PDF
 * (mode=download) or uses it to issue/revise the Work Order through the same
 * WorkOrderService.issue/createRevision path the manual upload flow already uses. */
export default function GenerateWorkOrderPdfModal({
  projectId,
  orderId,
  workOrder,
  vendorName,
  vendorAssigned,
  onClose,
  onSaved,
}: {
  projectId: string;
  orderId: string;
  workOrder: WorkOrder | null;
  vendorName: string | null;
  vendorAssigned: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: roles } = useSWR<RoleEntry[]>(`/api/projects/${projectId}/roles`, jsonFetcher);
  const { data: boqData } = useSWR<{ boqs: Array<{ items: BoqItem[] }>; total: number }>(
    `/api/projects/${projectId}/boq?orderId=${orderId}`,
    jsonFetcher,
  );
  const boqItems = useMemo(() => (boqData?.boqs ?? []).flatMap((b) => b.items), [boqData]);
  const boqSubtotal = useMemo(() => boqItems.reduce((sum, i) => sum + i.plannedValue, 0), [boqItems]);

  const currentRevision = workOrder?.revisions.find((r) => r.revisionNumber === workOrder.currentRevisionNumber) ?? null;

  const [mode, setMode] = useState<Mode>(workOrder ? 'download' : 'issue');
  const [details, setDetails] = useState<WorkOrderPdfDetails>(emptyPdfDetails());
  const [prefilled, setPrefilled] = useState(false);

  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [plannedStart, setPlannedStart] = useState('');
  const [plannedEnd, setPlannedEnd] = useState('');
  const [remarks, setRemarks] = useState('');
  const [reason, setReason] = useState('');

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const [aiHint, setAiHint] = useState('');
  const [aiDrafting, setAiDrafting] = useState(false);
  const [aiError, setAiError] = useState('');
  // Briefly true right after a successful AI fill, to flash a "just filled" glow on the fields —
  // cleared on a timer matching the ax-glow-fill CSS animation's duration (1.6s).
  const [justAiFilled, setJustAiFilled] = useState(false);

  const handleAiDraft = async () => {
    setAiDrafting(true);
    setAiError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/orders/${orderId}/work-order/ai-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ briefDescription: aiHint.trim() || undefined }),
      });
      const body = await res.json().catch(() => ({ success: false, error: 'AI drafting failed' }));
      if (!res.ok || !body.success) {
        setAiError(body.error ?? 'AI drafting failed — please fill the fields manually');
        return;
      }
      setDetails((d) => ({ ...d, ...body.data }));
      setJustAiFilled(true);
      setTimeout(() => setJustAiFilled(false), 1600);
    } catch {
      setAiError('AI drafting failed — please fill the fields manually');
    } finally {
      setAiDrafting(false);
    }
  };

  // Prefill from the current revision's saved details (if any) once roles/BOQ have loaded, so
  // regenerating reproduces the same document. Only runs once per modal open.
  useEffect(() => {
    if (prefilled || !roles) return;
    const saved = currentRevision?.pdfDetailsJson ? (JSON.parse(currentRevision.pdfDetailsJson) as WorkOrderPdfDetails) : null;
    if (saved) {
      setDetails(saved);
    } else {
      setDetails({
        ...emptyPdfDetails(),
        signatories: {
          preparedBy: { name: '', designation: '' },
          vendor: { name: vendorName ?? '', designation: '' },
          consultant: { name: roleNames(roles, 'CONSULTANT'), designation: '' },
          pmc: { name: roleNames(roles, 'PMC'), designation: '' },
          client: { name: roleNames(roles, 'CLIENT'), designation: '' },
        },
      });
    }
    if (currentRevision) {
      setIssueDate(currentRevision.issueDate.slice(0, 10));
      setPlannedStart(currentRevision.plannedStart?.slice(0, 10) ?? '');
      setPlannedEnd(currentRevision.plannedEnd?.slice(0, 10) ?? '');
    }
    setPrefilled(true);
  }, [prefilled, roles, currentRevision, vendorName]);

  const canSubmit =
    !generating &&
    !!issueDate &&
    (mode !== 'issue' || vendorAssigned) &&
    (mode !== 'revise' || reason.trim().length > 0);

  const set = <K extends keyof WorkOrderPdfDetails>(key: K, value: WorkOrderPdfDetails[K]) =>
    setDetails((d) => ({ ...d, [key]: value }));

  const setTC = (key: keyof WorkOrderPdfDetails['termsAndConditions'], value: string) =>
    setDetails((d) => ({ ...d, termsAndConditions: { ...d.termsAndConditions, [key]: value } }));

  const setSig = (key: keyof WorkOrderPdfDetails['signatories'], field: 'name' | 'designation', value: string) =>
    setDetails((d) => ({ ...d, signatories: { ...d.signatories, [key]: { ...d.signatories[key], [field]: value } } }));

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setGenerating(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/orders/${orderId}/work-order/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          issueDate,
          plannedStart: plannedStart || undefined,
          plannedEnd: plannedEnd || undefined,
          remarks: remarks.trim() || undefined,
          reason: mode === 'revise' ? reason.trim() : undefined,
          details,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Failed to generate PDF' }));
        setError(body.error ?? 'Failed to generate PDF');
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = /filename\*=UTF-8''([^;]+)/.exec(disposition);
      const filename = match ? decodeURIComponent(match[1]) : `${workOrder?.number ?? 'WorkOrder'}.pdf`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      if (mode !== 'download') onSaved();
      onClose();
    } catch {
      setError('Failed to generate PDF. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const label = 'label text-xs';
  const input = 'input text-sm';
  const textarea = 'input text-sm resize-none';

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#e8e4dc]">Generate Work Order PDF</h2>
            <button onClick={onClose} className="text-[rgba(232,228,220,0.4)] hover:text-[#e8e4dc] transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {error && <div className="alert alert-error text-sm">{error}</div>}

          {workOrder ? (
            <div className="flex gap-2 p-1 rounded-lg bg-[rgba(255,255,255,0.04)] w-fit">
              <button
                onClick={() => setMode('download')}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors ${mode === 'download' ? 'bg-[var(--ax-accent)] text-black font-medium' : 'text-[rgba(232,228,220,0.6)]'}`}
              >
                Download PDF
              </button>
              <button
                onClick={() => setMode('revise')}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors ${mode === 'revise' ? 'bg-[var(--ax-accent)] text-black font-medium' : 'text-[rgba(232,228,220,0.6)]'}`}
              >
                Generate &amp; Add as New Revision
              </button>
            </div>
          ) : (
            <div className="text-xs text-[rgba(232,228,220,0.55)]">
              No Work Order has been issued for this purchase order yet — generating a PDF here will issue Revision 0.
              {!vendorAssigned && <p className="text-[#eab308] mt-1">Assign a vendor before issuing a Work Order.</p>}
            </div>
          )}

          {/* Derived / read-only info */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs p-3 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)]">
            <div><p className="text-[rgba(232,228,220,0.4)]">Work Order #</p><p className="text-[#e8e4dc] mt-0.5">{workOrder?.number ?? '(assigned on issue)'}</p></div>
            <div><p className="text-[rgba(232,228,220,0.4)]">Revision</p><p className="text-[#e8e4dc] mt-0.5">R{mode === 'revise' ? (workOrder?.currentRevisionNumber ?? 0) + 1 : (workOrder?.currentRevisionNumber ?? 0)}</p></div>
            <div><p className="text-[rgba(232,228,220,0.4)]">Vendor</p><p className="text-[#e8e4dc] mt-0.5">{vendorName ?? '—'}</p></div>
            <div><p className="text-[rgba(232,228,220,0.4)]">Client</p><p className="text-[#e8e4dc] mt-0.5">{roleNames(roles, 'CLIENT') || '—'}</p></div>
            <div><p className="text-[rgba(232,228,220,0.4)]">Consultant</p><p className="text-[#e8e4dc] mt-0.5">{roleNames(roles, 'CONSULTANT') || '—'}</p></div>
            <div><p className="text-[rgba(232,228,220,0.4)]">PMC</p><p className="text-[#e8e4dc] mt-0.5">{roleNames(roles, 'PMC') || '—'}</p></div>
            <div className="col-span-2 sm:col-span-3">
              <p className="text-[rgba(232,228,220,0.4)]">BOQ items ({boqItems.length})</p>
              <p className="text-[#e8e4dc] mt-0.5">Subtotal {currencyFormatter.format(boqSubtotal)}</p>
            </div>
          </div>

          {mode !== 'download' && (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-3 gap-3">
                <div><label className={label}>Issue Date</label><input type="date" className={input} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></div>
                <div><label className={label}>Planned Start</label><input type="date" className={input} value={plannedStart} onChange={(e) => setPlannedStart(e.target.value)} /></div>
                <div><label className={label}>Planned End</label><input type="date" className={input} value={plannedEnd} onChange={(e) => setPlannedEnd(e.target.value)} /></div>
              </div>
              {mode === 'revise' && (
                <div>
                  <label className={label}>Reason for Revision</label>
                  <textarea rows={2} className={textarea} placeholder="e.g. Updated rates per client's request…" value={reason} onChange={(e) => setReason(e.target.value)} />
                </div>
              )}
              <div>
                <label className={label}>Remarks (optional)</label>
                <textarea rows={2} className={textarea} placeholder="e.g. Site handover pending client NOC…" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              </div>
            </div>
          )}

          <Section title="Work Order Details">
            <div className="flex gap-2 items-start p-3 rounded-lg bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)]">
              <input
                className={`${input} flex-1`}
                placeholder="Briefly describe the work (optional) — e.g. Supply and install structural steel framing"
                value={aiHint}
                onChange={(e) => setAiHint(e.target.value)}
              />
              <button
                type="button"
                onClick={() => void handleAiDraft()}
                disabled={aiDrafting}
                className="relative overflow-hidden btn btn-secondary text-xs whitespace-nowrap inline-flex items-center gap-1.5 disabled:opacity-90"
              >
                {aiDrafting && <span className="ax-shimmer-sweep" />}
                <Sparkles className={`w-3.5 h-3.5 relative ${aiDrafting ? 'ax-pulse-soft' : ''}`} />
                <span className="relative">{aiDrafting ? 'Drafting…' : 'Generate with AI'}</span>
              </button>
            </div>
            {aiError && <p className="text-xs text-[#e06050]">{aiError}</p>}
            <p className="text-xs text-[rgba(232,228,220,0.4)] -mt-1">
              Fills the fields below from the BOQ and vendor already on this purchase order — review and edit before generating the PDF.
            </p>
            <div className={`space-y-3 p-1 -m-1 ${justAiFilled ? 'ax-glow-fill' : ''}`}>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={label}>Completion Timeline</label><input className={input} placeholder="e.g. 45 days from issue" value={details.completionTimeline} onChange={(e) => set('completionTimeline', e.target.value)} /></div>
                <div><label className={label}>Payment Terms</label><input className={input} placeholder="e.g. 30% advance, balance on completion" value={details.paymentTerms} onChange={(e) => set('paymentTerms', e.target.value)} /></div>
                <div className="col-span-2"><label className={label}>Delivery Terms</label><input className={input} placeholder="e.g. FOB site, vendor arranges logistics" value={details.deliveryTerms} onChange={(e) => set('deliveryTerms', e.target.value)} /></div>
                <div className="col-span-2"><label className={label}>Tax % (optional, applied to BOQ subtotal)</label><input type="number" min={0} max={100} className={input} placeholder="e.g. 18" value={details.taxPercent ?? ''} onChange={(e) => set('taxPercent', e.target.value === '' ? null : Number(e.target.value))} /></div>
              </div>
              <div><label className={label}>Work Description</label><textarea rows={2} className={textarea} placeholder="e.g. Supply and installation of structural steel framing for the podium level." value={details.workDescription} onChange={(e) => set('workDescription', e.target.value)} /></div>
              <div><label className={label}>Scope of Work</label><textarea rows={2} className={textarea} placeholder="e.g. Fabrication, delivery, and erection per approved shop drawings, including all connections and finishing." value={details.scopeOfWork} onChange={(e) => set('scopeOfWork', e.target.value)} /></div>
              <div><label className={label}>General Notes</label><textarea rows={2} className={textarea} placeholder="e.g. Coordinate crane and material access with the site team in advance." value={details.generalNotes} onChange={(e) => set('generalNotes', e.target.value)} /></div>
              <div><label className={label}>Special Instructions</label><textarea rows={2} className={textarea} placeholder="e.g. No high-noise work permitted before 8 AM or after 8 PM." value={details.specialInstructions} onChange={(e) => set('specialInstructions', e.target.value)} /></div>
            </div>
          </Section>

          <Section title="Terms & Conditions">
            <div className={`grid grid-cols-2 gap-3 p-1 -m-1 ${justAiFilled ? 'ax-glow-fill' : ''}`}>
              <div><label className={label}>Payment Terms</label><textarea rows={2} className={textarea} placeholder="e.g. Net 30 on certified RA bills." value={details.termsAndConditions.payment} onChange={(e) => setTC('payment', e.target.value)} /></div>
              <div><label className={label}>Quality Requirements</label><textarea rows={2} className={textarea} placeholder="e.g. All materials must conform to relevant IS codes and carry mill test certificates." value={details.termsAndConditions.quality} onChange={(e) => setTC('quality', e.target.value)} /></div>
              <div><label className={label}>Safety Requirements</label><textarea rows={2} className={textarea} placeholder="e.g. Mandatory PPE at all times; fall protection above 3m." value={details.termsAndConditions.safety} onChange={(e) => setTC('safety', e.target.value)} /></div>
              <div><label className={label}>Delay Penalties</label><textarea rows={2} className={textarea} placeholder="e.g. 0.5% of contract value per week of delay, capped at 5%." value={details.termsAndConditions.delayPenalty} onChange={(e) => setTC('delayPenalty', e.target.value)} /></div>
              <div><label className={label}>Warranty</label><textarea rows={2} className={textarea} placeholder="e.g. 12-month warranty against manufacturing/workmanship defects." value={details.termsAndConditions.warranty} onChange={(e) => setTC('warranty', e.target.value)} /></div>
              <div><label className={label}>Other Conditions</label><textarea rows={2} className={textarea} placeholder="e.g. Any variation in scope requires a written change order." value={details.termsAndConditions.other} onChange={(e) => setTC('other', e.target.value)} /></div>
            </div>
          </Section>

          <Section title="Signatories">
            <div className="space-y-2">
              {(['preparedBy', 'vendor', 'consultant', 'pmc', 'client'] as const).map((key) => (
                <div key={key} className="grid grid-cols-3 gap-3 items-end">
                  <p className="text-xs text-[rgba(232,228,220,0.55)] capitalize">{key === 'preparedBy' ? 'Prepared By' : key === 'pmc' ? 'PMC' : key}</p>
                  <input className={input} placeholder="Name" value={details.signatories[key].name} onChange={(e) => setSig(key, 'name', e.target.value)} />
                  <input className={input} placeholder="Designation e.g. Project Manager" value={details.signatories[key].designation} onChange={(e) => setSig(key, 'designation', e.target.value)} />
                </div>
              ))}
            </div>
          </Section>

          <div className="flex justify-end gap-3 pt-2 border-t border-[rgba(255,255,255,0.07)]">
            <button onClick={onClose} className="btn btn-secondary text-sm">Cancel</button>
            <button
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
              className="btn btn-primary text-sm disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <FileDown className="w-4 h-4" />
              {generating ? 'Generating…' : mode === 'download' ? 'Generate & Download' : mode === 'revise' ? 'Generate & Add Revision' : 'Generate & Issue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 pt-3 border-t border-[rgba(255,255,255,0.07)]">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[rgba(232,228,220,0.5)]">{title}</h3>
      {children}
    </div>
  );
}
