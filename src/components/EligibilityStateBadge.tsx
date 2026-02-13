/**
 * EligibilityStateBadge - Displays canonical payment eligibility state
 *
 * GOVERNANCE RULES:
 * 1. This component ONLY displays data from the canonical PaymentEligibility record
 * 2. It does NOT compute any values - all computation is done server-side
 * 3. All roles see the SAME badge for the same eligibility
 * 4. Colors and labels are deterministic based on state
 */

import { EligibilityState, EligibilityStateLabels } from '@/types';

interface EligibilityStateBadgeProps {
  state: EligibilityState;
  size?: 'sm' | 'md' | 'lg';
}

const stateStyles: Record<EligibilityState, { bg: string; text: string }> = {
  NOT_DUE: { bg: 'bg-gray-100', text: 'text-gray-700' },
  DUE_PENDING_VERIFICATION: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  VERIFIED_NOT_ELIGIBLE: { bg: 'bg-gray-100', text: 'text-gray-600' },
  PARTIALLY_ELIGIBLE: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  FULLY_ELIGIBLE: { bg: 'bg-green-100', text: 'text-green-800' },
  BLOCKED: { bg: 'bg-red-100', text: 'text-red-800' },
  MARKED_PAID: { bg: 'bg-purple-100', text: 'text-purple-800' },
};

const sizeClasses = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
  lg: 'px-3 py-1.5 text-base',
};

export default function EligibilityStateBadge({
  state,
  size = 'sm',
}: EligibilityStateBadgeProps) {
  const style = stateStyles[state] || stateStyles.NOT_DUE;
  const label = EligibilityStateLabels[state] || state;

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${style.bg} ${style.text} ${sizeClasses[size]}`}
    >
      {label}
    </span>
  );
}
