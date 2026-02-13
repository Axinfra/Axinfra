/**
 * PaymentIndicatorBadge - Displays derived payment indicator
 *
 * GOVERNANCE RULES:
 * 1. This component displays the DERIVED indicator from PaymentEligibilityEngine
 * 2. Indicators are computed server-side - frontend NEVER computes eligibility
 * 3. All roles see the SAME indicator for the same eligibility
 * 4. Includes urgency display (due soon, overdue)
 */

import { PaymentIndicator } from '@/types';
import { formatCurrency } from '@/lib/utils';

interface PaymentIndicatorBadgeProps {
  indicator: PaymentIndicator;
  showAmount?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const indicatorStyles: Record<PaymentIndicator['indicator'], { bg: string; text: string; border?: string }> = {
  ELIGIBLE_DUE: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
  ELIGIBLE_NOT_DUE: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  BLOCKED: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
  OVERDUE: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-500' },
  NOT_DUE: { bg: 'bg-gray-100', text: 'text-gray-600' },
  PAID: { bg: 'bg-purple-100', text: 'text-purple-800' },
};

const sizeClasses = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
  lg: 'px-3 py-1.5 text-base',
};

export default function PaymentIndicatorBadge({
  indicator,
  showAmount = false,
  size = 'sm',
}: PaymentIndicatorBadgeProps) {
  const style = indicatorStyles[indicator.indicator] || indicatorStyles.NOT_DUE;
  const borderClass = style.border ? `border ${style.border}` : '';

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center rounded-full font-medium ${style.bg} ${style.text} ${borderClass} ${sizeClasses[size]}`}
      >
        {/* Urgency pulse indicator */}
        {indicator.isUrgent && (
          <span className="mr-1.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-current opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-current"></span>
          </span>
        )}
        {indicator.displayLabel}
      </span>

      {/* Amount display */}
      {showAmount && indicator.eligibleAmount > 0 && (
        <span className="text-sm text-gray-600">
          {formatCurrency(indicator.eligibleAmount)}
        </span>
      )}

      {/* Blocked amount indicator */}
      {showAmount && indicator.blockedAmount > 0 && (
        <span className="text-sm text-red-600">
          ({formatCurrency(indicator.blockedAmount)} blocked)
        </span>
      )}
    </div>
  );
}
