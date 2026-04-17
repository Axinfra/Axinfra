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
  ELIGIBLE_DUE: { bg: 'bg-[rgba(50,200,120,0.1)]', text: 'text-[#5cba80]', border: 'border-[rgba(92,186,128,0.3)]' },
  ELIGIBLE_NOT_DUE: { bg: 'bg-[rgba(196,163,90,0.12)]', text: 'text-[#c4a35a]' },
  BLOCKED: { bg: 'bg-[rgba(220,80,60,0.1)]', text: 'text-[#e06050]', border: 'border-[rgba(224,96,80,0.3)]' },
  OVERDUE: { bg: 'bg-[rgba(220,80,60,0.1)]', text: 'text-[#e06050]', border: 'border-[rgba(224,96,80,0.5)]' },
  NOT_DUE: { bg: 'bg-[rgba(255,255,255,0.03)]', text: 'text-[rgba(232,228,220,0.55)]' },
  PAID: { bg: 'bg-[rgba(50,200,120,0.1)]', text: 'text-[#5cba80]' },
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
        className={`inline-flex items-center rounded-[4px] font-medium ${style.bg} ${style.text} ${borderClass} ${sizeClasses[size]}`}
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
        <span className="text-sm text-[rgba(232,228,220,0.55)]">
          {formatCurrency(indicator.eligibleAmount)}
        </span>
      )}

      {/* Blocked amount indicator */}
      {showAmount && indicator.blockedAmount > 0 && (
        <span className="text-sm text-[#e06050]">
          ({formatCurrency(indicator.blockedAmount)} blocked)
        </span>
      )}
    </div>
  );
}
