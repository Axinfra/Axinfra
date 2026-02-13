// String-based enums for SQLite compatibility
export const Role = {
  OWNER: 'OWNER',
  PMC: 'PMC',
  VENDOR: 'VENDOR',
  VIEWER: 'VIEWER',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const MilestoneState = {
  DRAFT: 'DRAFT',
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'SUBMITTED',
  VERIFIED: 'VERIFIED',
  CLOSED: 'CLOSED',
} as const;
export type MilestoneState = (typeof MilestoneState)[keyof typeof MilestoneState];

export const PaymentModel = {
  ADVANCE: 'ADVANCE',
  PROGRESS_BASED: 'PROGRESS_BASED',
  MILESTONE_COMPLETE: 'MILESTONE_COMPLETE',
  RETENTION: 'RETENTION',
} as const;
export type PaymentModel = (typeof PaymentModel)[keyof typeof PaymentModel];

export const EvidenceStatus = {
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type EvidenceStatus = (typeof EvidenceStatus)[keyof typeof EvidenceStatus];

export const EligibilityState = {
  NOT_DUE: 'NOT_DUE',
  DUE_PENDING_VERIFICATION: 'DUE_PENDING_VERIFICATION',
  VERIFIED_NOT_ELIGIBLE: 'VERIFIED_NOT_ELIGIBLE',
  PARTIALLY_ELIGIBLE: 'PARTIALLY_ELIGIBLE',
  FULLY_ELIGIBLE: 'FULLY_ELIGIBLE',
  BLOCKED: 'BLOCKED',
  MARKED_PAID: 'MARKED_PAID',
} as const;
export type EligibilityState = (typeof EligibilityState)[keyof typeof EligibilityState];

export const EligibilityEventType = {
  EVIDENCE_SUBMITTED: 'EVIDENCE_SUBMITTED',
  EVIDENCE_APPROVED: 'EVIDENCE_APPROVED',
  EVIDENCE_REJECTED: 'EVIDENCE_REJECTED',
  VERIFICATION_CREATED: 'VERIFICATION_CREATED',
  MILESTONE_STATE_CHANGED: 'MILESTONE_STATE_CHANGED',
  DUE_DATE_REACHED: 'DUE_DATE_REACHED',
  BLOCKED_BY_PMC: 'BLOCKED_BY_PMC',
  BLOCKED_BY_OWNER: 'BLOCKED_BY_OWNER',
  UNBLOCKED_BY_OWNER: 'UNBLOCKED_BY_OWNER',
  MARKED_PAID_BY_OWNER: 'MARKED_PAID_BY_OWNER',
  MARKED_PAID_BY_PMC: 'MARKED_PAID_BY_PMC',
  CHANGE_REQUEST_APPROVED: 'CHANGE_REQUEST_APPROVED',
  RECALCULATION_TRIGGERED: 'RECALCULATION_TRIGGERED',
} as const;
export type EligibilityEventType = (typeof EligibilityEventType)[keyof typeof EligibilityEventType];

export const BOQStatus = {
  DRAFT: 'DRAFT',
  APPROVED: 'APPROVED',
  REVISED: 'REVISED',
} as const;
export type BOQStatus = (typeof BOQStatus)[keyof typeof BOQStatus];

export const FollowUpType = {
  PENDING_EVIDENCE_REVIEW: 'PENDING_EVIDENCE_REVIEW',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  PAYMENT_DUE_SOON: 'PAYMENT_DUE_SOON',
  PAYMENT_BLOCKED_TOO_LONG: 'PAYMENT_BLOCKED_TOO_LONG',
  HIGH_VENDOR_EXPOSURE: 'HIGH_VENDOR_EXPOSURE',
  BOQ_OVERRUN: 'BOQ_OVERRUN',
} as const;
export type FollowUpType = (typeof FollowUpType)[keyof typeof FollowUpType];

export const FollowUpStatus = {
  OPEN: 'OPEN',
  RESOLVED: 'RESOLVED',
  ESCALATED: 'ESCALATED',
} as const;
export type FollowUpStatus = (typeof FollowUpStatus)[keyof typeof FollowUpStatus];

// API Response types
export interface ApiResponse<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================
// PAYMENT ELIGIBILITY TYPES
// ============================================

export interface PaymentEligibilityRecord {
  id: string;
  milestoneId: string;
  boqValueCompleted: number;
  deductions: number;
  eligibleAmount: number;
  blockedAmount: number;
  state: EligibilityState;
  dueDate: Date | null;
  blockReasonCode: string | null;
  blockExplanation: string | null;
  blockedAt: Date | null;
  blockedByActorId: string | null;
  markedPaidAt: Date | null;
  markedPaidByActorId: string | null;
  paidExplanation: string | null;
  lastCalculatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentIndicator {
  indicator: 'ELIGIBLE_DUE' | 'ELIGIBLE_NOT_DUE' | 'BLOCKED' | 'OVERDUE' | 'NOT_DUE' | 'PAID';
  displayLabel: string;
  displayColor: 'green' | 'yellow' | 'red' | 'gray' | 'purple';
  eligibleAmount: number;
  blockedAmount: number;
  isUrgent: boolean;
  daysUntilDue: number | null;
  daysOverdue: number | null;
}

export const ValidStateTransitions: Record<EligibilityState, EligibilityState[]> = {
  NOT_DUE: [
    EligibilityState.DUE_PENDING_VERIFICATION,
    EligibilityState.VERIFIED_NOT_ELIGIBLE,
    EligibilityState.PARTIALLY_ELIGIBLE,
    EligibilityState.FULLY_ELIGIBLE,
  ],
  DUE_PENDING_VERIFICATION: [
    EligibilityState.VERIFIED_NOT_ELIGIBLE,
    EligibilityState.PARTIALLY_ELIGIBLE,
    EligibilityState.FULLY_ELIGIBLE,
  ],
  VERIFIED_NOT_ELIGIBLE: [
    EligibilityState.PARTIALLY_ELIGIBLE,
    EligibilityState.FULLY_ELIGIBLE,
  ],
  PARTIALLY_ELIGIBLE: [
    EligibilityState.FULLY_ELIGIBLE,
    EligibilityState.BLOCKED,
    EligibilityState.MARKED_PAID,
  ],
  FULLY_ELIGIBLE: [
    EligibilityState.BLOCKED,
    EligibilityState.MARKED_PAID,
  ],
  BLOCKED: [
    EligibilityState.PARTIALLY_ELIGIBLE,
    EligibilityState.FULLY_ELIGIBLE,
  ],
  MARKED_PAID: [],
};

// ============================================
// DASHBOARD TYPES
// ============================================

export interface OwnerDashboard {
  totalVerifiedValue: number;
  totalUnpaidValue: number;
  advanceExposure: number;
  boqOverruns: number;
  highRiskVendors: VendorRisk[];
  blockedPaymentsSummary: BlockedSummary[];
  projectsOverview: ProjectOverview[];
}

export interface PMCDashboard {
  pendingReviews: PendingReview[];
  duePayments: DuePayment[];
  blockedItems: BlockedItem[];
  upcomingDeadlines: UpcomingDeadline[];
}

export interface VendorDashboard {
  submittedMilestones: SubmittedMilestone[];
  rejections: RejectionRecord[];
  pendingApprovals: PendingApproval[];
  paymentStatus: PaymentStatusRecord[];
}

export interface VendorRisk {
  vendorId: string;
  vendorName: string;
  advancePaid: number;
  verifiedWork: number;
  exposureRatio: number;
}

export interface BlockedSummary {
  projectId: string;
  projectName: string;
  blockedCount: number;
  blockedValue: number;
}

export interface ProjectOverview {
  projectId: string;
  projectName: string;
  verifiedValue: number;
  paidValue: number;
  pendingValue: number;
}

export interface PendingReview {
  evidenceId: string;
  milestoneTitle: string;
  projectName: string;
  submittedAt: Date;
  vendorName: string;
  daysPending: number;
}

export interface DuePayment {
  eligibilityId: string;
  milestoneId: string;
  milestoneTitle: string;
  projectName: string;
  amount: number;
  dueDate: Date;
  state: EligibilityState;
}

export interface BlockedItem {
  eligibilityId: string;
  milestoneId: string;
  milestoneTitle: string;
  projectName: string;
  amount: number;
  blockedSince: Date;
  reason: string;
}

export interface UpcomingDeadline {
  milestoneId: string;
  milestoneTitle: string;
  projectName: string;
  deadline: Date;
  daysRemaining: number;
}

export interface SubmittedMilestone {
  milestoneId: string;
  title: string;
  projectName: string;
  submittedAt: Date;
  status: MilestoneState;
}

export interface RejectionRecord {
  evidenceId: string;
  milestoneTitle: string;
  projectName: string;
  rejectedAt: Date;
  reason: string;
}

export interface PendingApproval {
  evidenceId: string;
  milestoneTitle: string;
  projectName: string;
  submittedAt: Date;
}

export interface PaymentStatusRecord {
  eligibilityId: string;
  milestoneId: string;
  milestoneTitle: string;
  projectName: string;
  amount: number;
  state: EligibilityState;
  indicator: PaymentIndicator;
}

// Audit log action types
export const AuditActionTypes = {
  PROJECT_CREATE: 'PROJECT_CREATE',
  PROJECT_UPDATE: 'PROJECT_UPDATE',
  PROJECT_DELETE: 'PROJECT_DELETE',
  PROJECT_STATUS_CHANGE: 'PROJECT_STATUS_CHANGE',
  ROLE_ASSIGN: 'ROLE_ASSIGN',
  ROLE_REMOVE: 'ROLE_REMOVE',
  BOQ_CREATE: 'BOQ_CREATE',
  BOQ_APPROVE: 'BOQ_APPROVE',
  BOQ_REVISE: 'BOQ_REVISE',
  BOQ_ITEM_ADD: 'BOQ_ITEM_ADD',
  BOQ_ITEM_UPDATE: 'BOQ_ITEM_UPDATE',
  BOQ_ITEM_REMOVE: 'BOQ_ITEM_REMOVE',
  MILESTONE_CREATE: 'MILESTONE_CREATE',
  MILESTONE_UPDATE: 'MILESTONE_UPDATE',
  MILESTONE_DELETE: 'MILESTONE_DELETE',
  MILESTONE_STATE_TRANSITION: 'MILESTONE_STATE_TRANSITION',
  MILESTONE_BOQ_LINK: 'MILESTONE_BOQ_LINK',
  EVIDENCE_SUBMIT: 'EVIDENCE_SUBMIT',
  EVIDENCE_APPROVE: 'EVIDENCE_APPROVE',
  EVIDENCE_REJECT: 'EVIDENCE_REJECT',
  EVIDENCE_FREEZE: 'EVIDENCE_FREEZE',
  VERIFICATION_CREATE: 'VERIFICATION_CREATE',
  ELIGIBILITY_RECALCULATED: 'ELIGIBILITY_RECALCULATED',
  ELIGIBILITY_BLOCKED: 'ELIGIBILITY_BLOCKED',
  ELIGIBILITY_UNBLOCKED: 'ELIGIBILITY_UNBLOCKED',
  ELIGIBILITY_MARKED_PAID: 'ELIGIBILITY_MARKED_PAID',
  FOLLOWUP_CREATE: 'FOLLOWUP_CREATE',
  FOLLOWUP_RESOLVE: 'FOLLOWUP_RESOLVE',
  FOLLOWUP_ESCALATE: 'FOLLOWUP_ESCALATE',
} as const;

export type AuditActionType = (typeof AuditActionTypes)[keyof typeof AuditActionTypes];

// Blocking reason codes
export const BlockingReasonCodes = {
  QUALITY_ISSUE: 'QUALITY_ISSUE',
  DOCUMENTATION_INCOMPLETE: 'DOCUMENTATION_INCOMPLETE',
  DISPUTE_PENDING: 'DISPUTE_PENDING',
  COMPLIANCE_ISSUE: 'COMPLIANCE_ISSUE',
  BUDGET_HOLD: 'BUDGET_HOLD',
  VENDOR_ISSUE: 'VENDOR_ISSUE',
  OTHER: 'OTHER',
} as const;

export type BlockingReasonCode = (typeof BlockingReasonCodes)[keyof typeof BlockingReasonCodes];

export const BlockingReasonLabels: Record<BlockingReasonCode, string> = {
  QUALITY_ISSUE: 'Quality Issue',
  DOCUMENTATION_INCOMPLETE: 'Documentation Incomplete',
  DISPUTE_PENDING: 'Dispute Pending',
  COMPLIANCE_ISSUE: 'Compliance Issue',
  BUDGET_HOLD: 'Budget Hold',
  VENDOR_ISSUE: 'Vendor Issue',
  OTHER: 'Other',
};

// ============================================
// STATE LABELS FOR UI
// ============================================

export const EligibilityStateLabels: Record<EligibilityState, string> = {
  NOT_DUE: 'Not Due',
  DUE_PENDING_VERIFICATION: 'Due - Pending Verification',
  VERIFIED_NOT_ELIGIBLE: 'Verified - Not Eligible',
  PARTIALLY_ELIGIBLE: 'Partially Eligible',
  FULLY_ELIGIBLE: 'Fully Eligible',
  BLOCKED: 'Blocked',
  MARKED_PAID: 'Paid',
};

export const EligibilityStateColors: Record<EligibilityState, string> = {
  NOT_DUE: 'gray',
  DUE_PENDING_VERIFICATION: 'yellow',
  VERIFIED_NOT_ELIGIBLE: 'gray',
  PARTIALLY_ELIGIBLE: 'yellow',
  FULLY_ELIGIBLE: 'green',
  BLOCKED: 'red',
  MARKED_PAID: 'purple',
};
