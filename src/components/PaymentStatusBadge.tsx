'use client';

import { EligibilityState } from '@/types';

interface PaymentStatusBadgeProps {
  state: EligibilityState;
}

const stateConfig: Record<EligibilityState, { label: string; className: string }> = {
  NOT_DUE: { label: 'Not Due', className: 'badge-not-due' },
  DUE_PENDING_VERIFICATION: { label: 'Pending Verification', className: 'badge-pending' },
  VERIFIED_NOT_ELIGIBLE: { label: 'Not Eligible', className: 'badge-not-eligible' },
  PARTIALLY_ELIGIBLE: { label: 'Partially Eligible', className: 'badge-partial' },
  FULLY_ELIGIBLE: { label: 'Eligible', className: 'badge-eligible' },
  BLOCKED: { label: 'Blocked', className: 'badge-blocked' },
  MARKED_PAID: { label: 'Paid', className: 'badge-paid' },
};

export default function PaymentStatusBadge({ state }: PaymentStatusBadgeProps) {
  const config = stateConfig[state];

  return <span className={`badge ${config.className}`}>{config.label}</span>;
}
