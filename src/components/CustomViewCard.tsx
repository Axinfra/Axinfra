'use client';

import Link from 'next/link';
import MilestoneStateBadge from './MilestoneStateBadge';
import PaymentStatusBadge from './PaymentStatusBadge';
import { formatCurrency, formatDate } from '@/lib/utils';

interface MilestoneProjection {
  id: string;
  title: string;
  description: string | null;
  state: string;
  paymentModel: string;
  plannedEnd: string | null;
  plannedValue: number;
  completionPercent: number;
  isDelayed: boolean;
  vendor: string | null;
  trade: string | null;
  eligibilityState: string | null;
  paymentValue: number;
}

interface CustomViewCardProps {
  milestone: MilestoneProjection;
  projectId: string;
}

/**
 * CustomViewCard - READ-ONLY milestone card for custom views.
 *
 * CRITICAL: This component is READ-ONLY.
 * - No drag & drop
 * - No inline editing
 * - No state transitions
 * - Clicking opens the standard milestone detail page
 */
export default function CustomViewCard({ milestone, projectId }: CustomViewCardProps) {
  return (
    <Link
      href={`/projects/${projectId}/milestones/${milestone.id}`}
      className="block"
    >
      <div className="bg-[#141414] border border-[rgba(255,255,255,0.08)] rounded-lg p-4 hover:bg-[#1f1f1f] hover:border-[rgba(255,255,255,0.14)] transition-all cursor-pointer">
        {/* Header */}
        <div className="flex justify-between items-start mb-2">
          <h4 className="font-medium text-[#f5f1e8] text-sm line-clamp-2">
            {milestone.title}
          </h4>
          {milestone.isDelayed && (
            <span className="flex-shrink-0 ml-2 px-2 py-0.5 text-xs bg-[rgba(239,68,68,0.15)] text-red-300 rounded">
              Delayed
            </span>
          )}
        </div>

        {/* State Badge */}
        <div className="mb-2">
          <MilestoneStateBadge state={milestone.state as any} />
        </div>

        {/* Completion Progress */}
        <div className="mb-3">
          <div className="flex justify-between text-xs text-[rgba(232,228,220,0.6)] mb-1">
            <span>Completion</span>
            <span>{milestone.completionPercent}%</span>
          </div>
          <div className="w-full h-2 bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                milestone.completionPercent >= 70
                  ? 'bg-green-500'
                  : milestone.completionPercent >= 30
                  ? 'bg-yellow-500'
                  : 'bg-[rgba(255,255,255,0.25)]'
              }`}
              style={{ width: `${milestone.completionPercent}%` }}
            />
          </div>
        </div>

        {/* Details */}
        <div className="space-y-1 text-xs text-[rgba(232,228,220,0.6)]">
          {milestone.plannedEnd && (
            <div className="flex justify-between">
              <span>Due</span>
              <span className={milestone.isDelayed ? 'text-red-400 font-medium' : ''}>
                {formatDate(milestone.plannedEnd)}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Value</span>
            <span className="font-medium text-[rgba(232,228,220,0.8)]">
              {formatCurrency(milestone.plannedValue)}
            </span>
          </div>
          {milestone.trade && (
            <div className="flex justify-between">
              <span>Trade</span>
              <span>{milestone.trade}</span>
            </div>
          )}
        </div>

        {/* Payment Status */}
        {milestone.eligibilityState && (
          <div className="mt-3 pt-3 border-t border-[rgba(255,255,255,0.06)]">
            <div className="flex justify-between items-center">
              <PaymentStatusBadge state={milestone.eligibilityState as any} />
              <span className="text-xs font-medium text-[rgba(232,228,220,0.8)]">
                {formatCurrency(milestone.paymentValue)}
              </span>
            </div>
          </div>
        )}

        {/* Read-only indicator (subtle) */}
        <div className="mt-3 text-center">
          <span className="text-[10px] text-gray-400">Click to view details</span>
        </div>
      </div>
    </Link>
  );
}
