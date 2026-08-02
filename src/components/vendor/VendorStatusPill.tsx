import { AlertTriangle, CheckCircle2, Circle, Clock, XCircle } from 'lucide-react';

type Kind = 'workOrder' | 'boq' | 'raBill' | 'milestone' | 'directOrder';

interface StatusMeta {
  label: string;
  icon: typeof Circle;
  color: string;
  bg: string;
}

/** gray = not started · orange = needs the vendor's action now · blue = waiting on someone
 * else · green = done · red = rejected/needs fixing. Icon always carries the meaning — the
 * word is a secondary confirmation, not the primary signal. */
const GRAY = { color: '#9a9690', bg: 'rgba(154,150,144,0.16)' };
const ORANGE = { color: '#f0a825', bg: 'rgba(240,168,37,0.16)' };
const BLUE = { color: '#38bdf8', bg: 'rgba(56,189,248,0.16)' };
const GREEN = { color: '#22c55e', bg: 'rgba(34,197,94,0.16)' };
const RED = { color: '#ef4444', bg: 'rgba(239,68,68,0.16)' };

const MAP: Record<Kind, Record<string, StatusMeta>> = {
  workOrder: {
    DRAFT: { label: 'Not Sent', icon: Circle, ...GRAY },
    ISSUED: { label: 'Action Needed', icon: AlertTriangle, ...ORANGE },
    PENDING_VENDOR_ACCEPTANCE: { label: 'Action Needed', icon: AlertTriangle, ...ORANGE },
    ACCEPTED: { label: 'Accepted', icon: CheckCircle2, ...GREEN },
    CHANGES_REQUESTED: { label: 'Waiting', icon: Clock, ...BLUE },
  },
  boq: {
    DRAFT: { label: 'Not Sent', icon: Circle, ...GRAY },
    REVISED: { label: 'Updated', icon: Clock, ...ORANGE },
    PENDING_APPROVAL: { label: 'Waiting', icon: Clock, ...BLUE },
    APPROVED: { label: 'Approved', icon: CheckCircle2, ...GREEN },
  },
  raBill: {
    DRAFT: { label: 'Send Now', icon: AlertTriangle, ...ORANGE },
    PENDING_VENDOR_REVIEW: { label: 'Waiting', icon: Clock, ...BLUE },
    REVISION_REQUESTED: { label: 'Fix & Resend', icon: AlertTriangle, ...RED },
    CERTIFIED: { label: 'Checked', icon: Clock, ...BLUE },
    APPROVED: { label: 'Approved', icon: CheckCircle2, ...GREEN },
    PAID: { label: 'Paid', icon: CheckCircle2, ...GREEN },
  },
  milestone: {
    DRAFT: { label: 'Not Started', icon: Circle, ...GRAY },
    IN_PROGRESS: { label: 'In Progress', icon: Clock, ...ORANGE },
    SUBMITTED: { label: 'In Progress', icon: Clock, ...ORANGE },
    VERIFIED: { label: 'Done', icon: CheckCircle2, ...GREEN },
    CLOSED: { label: 'Done', icon: CheckCircle2, ...GREEN },
  },
  directOrder: {
    ORDERED: { label: 'Ordered', icon: Circle, ...GRAY },
    IN_PROGRESS: { label: 'In Progress', icon: Clock, ...ORANGE },
    IN_DELIVERY: { label: 'In Delivery', icon: Clock, ...BLUE },
    DELIVERED: { label: 'Awaiting Payment', icon: AlertTriangle, ...ORANGE },
    QTY_VARIANCE: { label: 'Qty Variance', icon: AlertTriangle, ...RED },
    PAID: { label: 'Paid', icon: CheckCircle2, ...GREEN },
  },
};

export default function VendorStatusPill({ kind, status, size = 'md' }: { kind: Kind; status: string; size?: 'sm' | 'md' }) {
  const meta = MAP[kind][status] ?? { label: status, icon: XCircle, ...GRAY };
  const Icon = meta.icon;
  const isSmall = size === 'sm';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-bold ${isSmall ? 'text-sm px-3 py-1.5' : 'text-base px-3.5 py-2'}`}
      style={{ color: meta.color, background: meta.bg, boxShadow: `inset 0 0 0 1.5px ${meta.color}2e` }}
    >
      <Icon className={isSmall ? 'w-4 h-4' : 'w-[18px] h-[18px]'} strokeWidth={2.5} />
      {meta.label}
    </span>
  );
}
