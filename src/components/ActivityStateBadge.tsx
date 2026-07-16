'use client';

import { MilestoneState as ActivityState } from '@/types';
import { Badge } from '@/components/ui/Badge';

interface ActivityStateBadgeProps {
  state: ActivityState;
}

// Status is auto-derived from percentComplete (0% / 1-99% / 100%) — never set by hand. SUBMITTED
// is folded into "In Progress" since new activities never enter it; it only ever appears on
// legacy rows from before the manual Submit/Verify flow was removed.
const stateConfig: Record<ActivityState, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "neutral" }> = {
  DRAFT: { label: 'Not Started', variant: 'neutral' },
  IN_PROGRESS: { label: 'In Progress', variant: 'default' },
  SUBMITTED: { label: 'In Progress', variant: 'default' },
  VERIFIED: { label: 'Completed', variant: 'success' },
  CLOSED: { label: 'Completed', variant: 'success' },
};

export default function ActivityStateBadge({ state }: ActivityStateBadgeProps) {
  const config = stateConfig[state] || { label: state, variant: 'neutral' };

  return <Badge variant={config.variant}>{config.label}</Badge>;
}
