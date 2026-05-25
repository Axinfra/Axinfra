'use client';

import { MilestoneState } from '@/types';
import { Badge } from '@/components/ui/Badge';

interface MilestoneStateBadgeProps {
  state: MilestoneState;
}

const stateConfig: Record<MilestoneState, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "neutral" }> = {
  DRAFT: { label: 'Draft', variant: 'neutral' },
  IN_PROGRESS: { label: 'In Progress', variant: 'default' },
  SUBMITTED: { label: 'Evidence Submitted', variant: 'warning' },
  VERIFIED: { label: 'Verified', variant: 'success' },
  CLOSED: { label: 'Closed', variant: 'neutral' },
};

export default function MilestoneStateBadge({ state }: MilestoneStateBadgeProps) {
  const config = stateConfig[state] || { label: state, variant: 'neutral' };

  return <Badge variant={config.variant}>{config.label}</Badge>;
}
