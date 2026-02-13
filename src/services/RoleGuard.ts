import { Role } from '@/types';
import { ProjectAuthContext } from '@/lib/auth';

/**
 * RoleGuard - Server-side role enforcement.
 *
 * SPEC REQUIREMENT: Roles are hard-enforced server-side.
 * No UI-only permission logic. No role overlap initially.
 */
export class RoleGuard {
  /**
   * Check if user has one of the allowed roles.
   * Throws if unauthorized.
   */
  static requireRole(auth: ProjectAuthContext, allowedRoles: Role[]): void {
    if (!allowedRoles.includes(auth.role)) {
      throw new Error(`FORBIDDEN: Role ${auth.role} not allowed. Required: ${allowedRoles.join(' or ')}`);
    }
  }

  /**
   * Check if user can read project data.
   * All roles can read.
   */
  static canRead(auth: ProjectAuthContext): boolean {
    return [Role.OWNER, Role.PMC, Role.VENDOR, Role.VIEWER].includes(auth.role);
  }

  /**
   * Check if user can create/modify project settings.
   * Only Owner.
   */
  static canManageProject(auth: ProjectAuthContext): boolean {
    return auth.role === Role.OWNER;
  }

  /**
   * Check if user can manage roles.
   * Only Owner.
   */
  static canManageRoles(auth: ProjectAuthContext): boolean {
    return auth.role === Role.OWNER;
  }

  /**
   * Check if user can create/modify BOQ.
   * Owner and PMC can modify, but only Owner can approve.
   */
  static canEditBOQ(auth: ProjectAuthContext): boolean {
    return auth.role === Role.OWNER || auth.role === Role.PMC;
  }

  /**
   * Check if user can approve BOQ.
   * Only Owner.
   */
  static canApproveBOQ(auth: ProjectAuthContext): boolean {
    return auth.role === Role.OWNER;
  }

  /**
   * Check if user can create/modify milestones.
   * Owner and PMC.
   */
  static canEditMilestones(auth: ProjectAuthContext): boolean {
    return auth.role === Role.OWNER || auth.role === Role.PMC;
  }

  /**
   * Check if user can submit evidence.
   * Only Vendor.
   */
  static canSubmitEvidence(auth: ProjectAuthContext): boolean {
    return auth.role === Role.VENDOR;
  }

  /**
   * Check if user can review (approve/reject) evidence.
   * Owner and PMC. Vendor cannot approve own work.
   */
  static canReviewEvidence(auth: ProjectAuthContext): boolean {
    return auth.role === Role.OWNER || auth.role === Role.PMC;
  }

  /**
   * Check if user can verify milestones.
   * Owner and PMC only.
   */
  static canVerify(auth: ProjectAuthContext): boolean {
    return auth.role === Role.OWNER || auth.role === Role.PMC;
  }

  /**
   * Check if user can block payments.
   * Owner and PMC.
   */
  static canBlockPayment(auth: ProjectAuthContext): boolean {
    return auth.role === Role.OWNER || auth.role === Role.PMC;
  }

  /**
   * Check if user can mark payments as paid.
   * Owner and PMC.
   */
  static canMarkPaid(auth: ProjectAuthContext): boolean {
    return auth.role === Role.OWNER || auth.role === Role.PMC;
  }

  /**
   * Check if user can unblock payments (override blocks).
   * Only Owner (with mandatory reason).
   */
  static canUnblockPayment(auth: ProjectAuthContext): boolean {
    return auth.role === Role.OWNER;
  }

  /**
   * Check if user can view payment details.
   * All roles except Viewer have full access; Vendor has read-only.
   */
  static canViewPayments(auth: ProjectAuthContext): boolean {
    return auth.role === Role.OWNER || auth.role === Role.PMC || auth.role === Role.VENDOR;
  }

  /**
   * Check if user can export audit logs.
   * Owner and PMC.
   */
  static canExportAuditLog(auth: ProjectAuthContext): boolean {
    return auth.role === Role.OWNER || auth.role === Role.PMC;
  }

  /**
   * Check if user can resolve follow-ups.
   * Owner and PMC.
   */
  static canResolveFollowUp(auth: ProjectAuthContext): boolean {
    return auth.role === Role.OWNER || auth.role === Role.PMC;
  }

  /**
   * Validate that a vendor is not trying to approve their own work.
   * SPEC: Vendor cannot approve/verify own milestones.
   */
  static validateNotSelfApproval(reviewerId: string, submitterId: string): void {
    if (reviewerId === submitterId) {
      throw new Error('FORBIDDEN: Cannot approve own work');
    }
  }

  /**
   * Get permission summary for a role.
   * Useful for UI rendering.
   */
  static getPermissions(role: Role): Record<string, boolean> {
    const fakeAuth = { userId: '', email: '', name: '', projectId: '', role } as ProjectAuthContext;

    return {
      canRead: this.canRead(fakeAuth),
      canManageProject: this.canManageProject(fakeAuth),
      canManageRoles: this.canManageRoles(fakeAuth),
      canEditBOQ: this.canEditBOQ(fakeAuth),
      canApproveBOQ: this.canApproveBOQ(fakeAuth),
      canEditMilestones: this.canEditMilestones(fakeAuth),
      canSubmitEvidence: this.canSubmitEvidence(fakeAuth),
      canReviewEvidence: this.canReviewEvidence(fakeAuth),
      canVerify: this.canVerify(fakeAuth),
      canBlockPayment: this.canBlockPayment(fakeAuth),
      canMarkPaid: this.canMarkPaid(fakeAuth),
      canUnblockPayment: this.canUnblockPayment(fakeAuth),
      canViewPayments: this.canViewPayments(fakeAuth),
      canExportAuditLog: this.canExportAuditLog(fakeAuth),
      canResolveFollowUp: this.canResolveFollowUp(fakeAuth),
    };
  }
}
