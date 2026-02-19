/**
 * EligibilityStateBadge - Displays canonical payment eligibility state
 */

import { EligibilityState, EligibilityStateLabels } from '@/types';
import { Badge } from '@/components/ui/Badge';

interface EligibilityStateBadgeProps {
  state: EligibilityState;
  size?: 'sm' | 'md' | 'lg';
}

const stateVariants: Record<EligibilityState, "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "neutral"> = {
  NOT_DUE: 'neutral',
  DUE_PENDING_VERIFICATION: 'warning',
  VERIFIED_NOT_ELIGIBLE: 'neutral',
  PARTIALLY_ELIGIBLE: 'warning',
  FULLY_ELIGIBLE: 'success',
  BLOCKED: 'destructive',
  MARKED_PAID: 'success', // or a special paid variant if added, using success for now
};

export default function EligibilityStateBadge({
  state,
  size = 'sm',
}: EligibilityStateBadgeProps) {
  const variant = stateVariants[state] || 'neutral';
  const label = EligibilityStateLabels[state] || state;

  return (
    <Badge variant={variant} className={size === 'lg' ? 'text-base px-3 py-1' : ''}>
      {label}
    </Badge>
  );
}
