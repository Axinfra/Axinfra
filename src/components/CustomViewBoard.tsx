'use client';

import CustomViewCard from './CustomViewCard';
import { formatCurrency } from '@/lib/utils';

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

interface GroupedMilestones {
  groupKey: string;
  groupLabel: string;
  milestones: MilestoneProjection[];
  totalValue: number;
  count: number;
}

interface CustomViewBoardProps {
  groups: GroupedMilestones[];
  projectId: string;
  viewName?: string;
}

/**
 * CustomViewBoard - READ-ONLY board rendering for custom views.
 *
 * CRITICAL SAFETY CONSTRAINTS:
 * - NO drag & drop functionality
 * - NO inline editing
 * - NO state transitions
 * - This is a visual projection ONLY
 */
export default function CustomViewBoard({ groups, projectId, viewName }: CustomViewBoardProps) {
  const totalMilestones = groups.reduce((sum, g) => sum + g.count, 0);
  const totalValue = groups.reduce((sum, g) => sum + g.totalValue, 0);

  return (
    <div className="space-y-4">
      {/* Read-only warning banner */}
      <div className="bg-[rgba(196,163,90,0.08)] border border-[rgba(196,163,90,0.15)] rounded-lg p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <svg
              className="w-5 h-5 text-[#c4a35a]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-sm text-[#c4a35a]">
              <strong>Read-only View</strong> – Axinfra state enforced. State changes must be done via the main board.
            </span>
          </div>
          <div className="text-sm text-[rgba(232,228,220,0.55)]">
            {totalMilestones} milestone{totalMilestones !== 1 ? 's' : ''} • {formatCurrency(totalValue)} total
          </div>
        </div>
      </div>

      {/* Board columns */}
      {groups.length === 0 ? (
        <div className="text-center py-12 text-[rgba(232,228,220,0.55)]">
          No milestones match the current filters.
        </div>
      ) : groups.length === 1 && groups[0].groupKey === 'all' ? (
        // Single list view (no grouping)
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {groups[0].milestones.map((milestone) => (
            <CustomViewCard
              key={milestone.id}
              milestone={milestone}
              projectId={projectId}
            />
          ))}
        </div>
      ) : (
        // Grouped Kanban-style view
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
          {groups.map((group) => (
            <div
              key={group.groupKey}
              className="flex-shrink-0 w-80 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-lg"
            >
              {/* Column Header */}
              <div className="p-3 border-b border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.04)] rounded-t-lg">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-[#e8e4dc]">{group.groupLabel}</h3>
                  <span className="text-sm text-[rgba(232,228,220,0.55)]">{group.count}</span>
                </div>
                <div className="text-xs text-[rgba(232,228,220,0.35)] mt-1">
                  {formatCurrency(group.totalValue)}
                </div>
              </div>

              {/* Column Content - NO DRAG & DROP */}
              <div className="p-2 space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto scrollbar-thin">
                {group.milestones.length === 0 ? (
                  <div className="text-center py-8 text-[rgba(232,228,220,0.35)] text-sm">
                    No milestones
                  </div>
                ) : (
                  group.milestones.map((milestone) => (
                    <CustomViewCard
                      key={milestone.id}
                      milestone={milestone}
                      projectId={projectId}
                    />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
