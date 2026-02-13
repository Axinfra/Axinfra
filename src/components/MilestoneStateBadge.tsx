'use client';

import { MilestoneState } from '@/types';

interface MilestoneStateBadgeProps {
  state: MilestoneState;
}

const stateConfig: Record<MilestoneState, { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'badge-draft' },
  IN_PROGRESS: { label: 'In Progress', className: 'badge-in-progress' },
  SUBMITTED: { label: 'Submitted', className: 'badge-submitted' },
  VERIFIED: { label: 'Verified', className: 'badge-verified' },
  CLOSED: { label: 'Closed', className: 'badge-closed' },
};

export default function MilestoneStateBadge({ state }: MilestoneStateBadgeProps) {
  const config = stateConfig[state];

  return <span className={`badge ${config.className}`}>{config.label}</span>;
}
