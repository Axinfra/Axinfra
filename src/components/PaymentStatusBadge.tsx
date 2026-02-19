'use client';

import { EligibilityState } from '@/types';
import { Badge } from '@/components/ui/Badge';

interface PaymentStatusBadgeProps {
  state: EligibilityState;
}

const stateConfig: Record<EligibilityState, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "neutral" }> = {
  NOT_DUE: { label: 'Not Due', variant: 'neutral' },
  DUE_PENDING_VERIFICATION: { label: 'Pending Verification', variant: 'warning' },
  VERIFIED_NOT_ELIGIBLE: { label: 'Not Eligible', variant: 'neutral' },
  PARTIALLY_ELIGIBLE: { label: 'Partially Eligible', variant: 'warning' },
  FULLY_ELIGIBLE: { label: 'Eligible', variant: 'success' },
  BLOCKED: { label: 'Blocked', variant: 'destructive' },
  MARKED_PAID: { label: 'Paid', variant: 'success' },
};

export default function PaymentStatusBadge({ state }: PaymentStatusBadgeProps) {
  const config = stateConfig[state] || { label: state, variant: 'neutral' };

  return <Badge variant={config.variant}>{config.label}</Badge>;
}
