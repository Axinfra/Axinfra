import { Role } from '@/types';
import { ProjectAuthContext } from '@/lib/auth';

/**
 * RoleGuard - Server-side role enforcement.
 *
 * Allowed roles: OWNER, PMC, VENDOR, VIEWER, CONSULTANT
 */
export class RoleGuard {
  static requireRole(auth: ProjectAuthContext, allowedRoles: Role[]): void {
    if (!allowedRoles.includes(auth.role)) {
      throw new Error(`FORBIDDEN: Role ${auth.role} not allowed. Required: ${allowedRoles.join(' or ')}`);
    }
  }

  static canRead(auth: ProjectAuthContext): boolean {
    return ([Role.OWNER, Role.PMC, Role.VENDOR, Role.VIEWER, Role.CONSULTANT] as string[]).includes(auth.role);
  }

  static canManageProject(auth: ProjectAuthContext): boolean {
    return auth.role === Role.OWNER;
  }

  static canManageRoles(auth: ProjectAuthContext): boolean {
    return auth.role === Role.OWNER;
  }

  static canEditBOQ(auth: ProjectAuthContext): boolean {
    return auth.role === Role.PMC;
  }

  static canApproveBOQ(auth: ProjectAuthContext): boolean {
    return auth.role === Role.OWNER;
  }

  static canEditMilestones(auth: ProjectAuthContext): boolean {
    return auth.role === Role.OWNER || auth.role === Role.PMC;
  }

  static canSubmitEvidence(auth: ProjectAuthContext): boolean {
    return auth.role === Role.VENDOR;
  }

  static canReviewEvidence(auth: ProjectAuthContext): boolean {
    return auth.role === Role.OWNER || auth.role === Role.PMC || auth.role === Role.CONSULTANT;
  }

  static canVerify(auth: ProjectAuthContext): boolean {
    return auth.role === Role.PMC;
  }

  static canBlockPayment(auth: ProjectAuthContext): boolean {
    return auth.role === Role.OWNER || auth.role === Role.PMC;
  }

  static canMarkPaid(auth: ProjectAuthContext): boolean {
    return auth.role === Role.OWNER || auth.role === Role.PMC;
  }

  static canUnblockPayment(auth: ProjectAuthContext): boolean {
    return auth.role === Role.OWNER;
  }

  static canViewPayments(auth: ProjectAuthContext): boolean {
    return auth.role === Role.OWNER || auth.role === Role.PMC || auth.role === Role.VENDOR;
  }

  static canExportAuditLog(auth: ProjectAuthContext): boolean {
    return auth.role === Role.OWNER || auth.role === Role.PMC || auth.role === Role.CONSULTANT;
  }

  static canResolveFollowUp(auth: ProjectAuthContext): boolean {
    return auth.role === Role.OWNER || auth.role === Role.PMC;
  }

  /** Cash module access - OWNER only */
  static canAccessCashModule(auth: ProjectAuthContext): boolean {
    return auth.role === Role.OWNER;
  }

  /** Artifacts role: upload/manage project documents, drawings, and deliverables */
  static canManageArtifacts(auth: ProjectAuthContext): boolean {
    return auth.role === Role.OWNER || auth.role === Role.PMC || auth.role === Role.CONSULTANT;
  }

  static validateNotSelfApproval(reviewerId: string, submitterId: string): void {
    if (reviewerId === submitterId) {
      throw new Error('FORBIDDEN: Cannot approve own work');
    }
  }

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
      canAccessCashModule: this.canAccessCashModule(fakeAuth),
      canManageArtifacts: this.canManageArtifacts(fakeAuth),
    };
  }
}
