export interface ArchitectureSetStatus {
  status: string;
}

export interface ArchitectureRowStatus {
  status: string;
}

export interface ArchitectureDueSet {
  id: string;
  name: string;
  status: string;
  dueDate: Date | null;
}

export interface ArchitectureSnapshotInput {
  sets: ArchitectureSetStatus[];
  rows: ArchitectureRowStatus[];
  pendingReview: number;
  dueSoonSets: ArchitectureDueSet[];
  nowMs?: number;
}

export function buildArchitectureSnapshot(input: ArchitectureSnapshotInput) {
  const now = input.nowMs ?? Date.now();
  return {
    sets: {
      total: input.sets.length,
      requested: input.sets.filter((s) => s.status === 'REQUESTED').length,
      inProgress: input.sets.filter((s) => s.status === 'IN_PROGRESS').length,
      approved: input.sets.filter((s) => s.status === 'APPROVED').length,
      paid: input.sets.filter((s) => s.status === 'PAID').length,
    },
    rows: {
      total: input.rows.length,
      pending: input.rows.filter((r) => r.status === 'PENDING').length,
      submitted: input.rows.filter((r) => r.status === 'SUBMITTED').length,
      approved: input.rows.filter((r) => r.status === 'APPROVED').length,
      rejected: input.rows.filter((r) => r.status === 'REJECTED').length,
    },
    pendingReview: input.pendingReview,
    dueDates: input.dueSoonSets.map((set) => ({
      id: set.id,
      name: set.name,
      status: set.status,
      dueDate: set.dueDate,
      daysRemaining: set.dueDate
        ? Math.ceil((set.dueDate.getTime() - now) / (1000 * 60 * 60 * 24))
        : null,
    })),
  };
}
