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
    return ([Role.CLIENT, Role.PMC, Role.VENDOR, Role.VIEWER, Role.CONSULTANT, Role.SITE_ENGINEER] as string[]).includes(auth.role);
  }

  static canManageProject(auth: ProjectAuthContext): boolean {
    return auth.role === Role.CLIENT;
  }

  static canManageRoles(auth: ProjectAuthContext): boolean {
    return auth.role === Role.CLIENT;
  }

  static canEditBOQ(auth: ProjectAuthContext): boolean {
    return auth.role === Role.PMC;
  }

  static canApproveBOQ(auth: ProjectAuthContext): boolean {
    return auth.role === Role.CLIENT;
  }

  /**
   * Which BOQ statuses a role is allowed to see. PMC sees everything (they're still drafting
   * some of it) — Site Engineer mirrors PMC here since it's a read-only view of the same data,
   * not a restricted one. Owner shouldn't see BOQs PMC hasn't submitted yet — DRAFT is hidden,
   * but REVISED stays visible since Owner is the one who triggered that state. Vendor/Consultant
   * (and any other role) only ever see the final APPROVED version — never a draft or an
   * in-review one. `null` means "no filter, show every status."
   */
  static visibleBOQStatuses(auth: ProjectAuthContext): string[] | null {
    if (auth.role === Role.PMC || auth.role === Role.SITE_ENGINEER) return null;
    if (auth.role === Role.CLIENT) return ['PENDING_APPROVAL', 'REVISED', 'APPROVED'];
    return ['APPROVED'];
  }

  static canEditMilestones(auth: ProjectAuthContext): boolean {
    return auth.role === Role.CLIENT || auth.role === Role.PMC;
  }

  static canSubmitForVerification(auth: ProjectAuthContext): boolean {
    return auth.role === Role.VENDOR;
  }

  static canVerify(auth: ProjectAuthContext): boolean {
    return auth.role === Role.PMC;
  }

  static canBlockPayment(auth: ProjectAuthContext): boolean {
    return auth.role === Role.CLIENT || auth.role === Role.PMC;
  }

  static canMarkPaid(auth: ProjectAuthContext): boolean {
    return auth.role === Role.CLIENT || auth.role === Role.PMC;
  }

  static canUnblockPayment(auth: ProjectAuthContext): boolean {
    return auth.role === Role.CLIENT;
  }

  static canViewPayments(auth: ProjectAuthContext): boolean {
    return auth.role === Role.CLIENT || auth.role === Role.PMC || auth.role === Role.VENDOR;
  }

  static canExportAuditLog(auth: ProjectAuthContext): boolean {
    return auth.role === Role.CLIENT || auth.role === Role.PMC || auth.role === Role.CONSULTANT;
  }

  static canResolveFollowUp(auth: ProjectAuthContext): boolean {
    return auth.role === Role.CLIENT || auth.role === Role.PMC;
  }

  /** Cash module access - OWNER only */
  static canAccessCashModule(auth: ProjectAuthContext): boolean {
    return auth.role === Role.CLIENT;
  }

  /** Artifacts role: upload/manage project documents, drawings, and deliverables */
  static canManageArtifacts(auth: ProjectAuthContext): boolean {
    return auth.role === Role.CLIENT || auth.role === Role.PMC || auth.role === Role.CONSULTANT;
  }

  /** RA Bills: the assigned vendor drafts/edits their own bill (checked as an ownership rule
   * inline in the service, not here). This permission gates the PMC/Consultant side of the
   * workflow — certifying measured quantities or sending a bill back for revision. */
  static canManageRABill(auth: ProjectAuthContext): boolean {
    return auth.role === Role.PMC || auth.role === Role.CONSULTANT;
  }

  /** RA Bills: Client or Site Engineer approves a certified bill, setting the approved value
   * and any deductions. Releasing the actual payment afterwards stays PMC/Client-only — see
   * the release-payment route, deliberately not gated by this same method. */
  static canApproveRABill(auth: ProjectAuthContext): boolean {
    return auth.role === Role.CLIENT || auth.role === Role.SITE_ENGINEER;
  }

  /** RA Bills: Site Engineer reviews every vendor submission before PMC ever sees it — can edit
   * the claimed quantities directly (the vendor has no say in this edit) and then forwards it to
   * PMC. A separate, earlier step from canApproveRABill above. */
  static canSiteEngineerReviewRABill(auth: ProjectAuthContext): boolean {
    return auth.role === Role.SITE_ENGINEER;
  }

  static validateNotSelfApproval(reviewerId: string, submitterId: string): void {
    if (reviewerId === submitterId) {
      throw new Error('FORBIDDEN: Cannot approve own work');
    }
  }

  /** Documents module: Specs/Other Docs upload — mirrors who can manage Architecture artifacts. */
  static canUploadProjectDocument(auth: ProjectAuthContext): boolean {
    return auth.role === Role.PMC || auth.role === Role.CONSULTANT;
  }

  /** Documents module: Checklists/DPR are visible to everyone except Vendor. */
  static canViewChecklistsAndDPR(auth: ProjectAuthContext): boolean {
    return ([Role.CLIENT, Role.PMC, Role.VIEWER, Role.CONSULTANT, Role.SITE_ENGINEER] as string[]).includes(auth.role);
  }

  /** Project Reports (weekly/monthly rollup): same visibility as Checklists/DPR — it's a
   * summary of things these roles can already see individually. Vendor excluded. */
  static canViewProjectReport(auth: ProjectAuthContext): boolean {
    return ([Role.CLIENT, Role.PMC, Role.VIEWER, Role.CONSULTANT, Role.SITE_ENGINEER] as string[]).includes(auth.role);
  }

  /** Checklists: PMC defines the check points against a drawing reference. */
  static canCreateChecklist(auth: ProjectAuthContext): boolean {
    return auth.role === Role.PMC;
  }

  /** Checklists: Site Engineer marks OK/Not OK/N.A. per row and adds remarks. */
  static canFillChecklist(auth: ProjectAuthContext): boolean {
    return auth.role === Role.SITE_ENGINEER;
  }

  /** Checklists: Site Engineer digitally signs, freezing the record. */
  static canSignChecklist(auth: ProjectAuthContext): boolean {
    return auth.role === Role.SITE_ENGINEER;
  }

  /** DPR: Site Engineer fills and signs the daily report — its only other edit capability. */
  static canFillDPR(auth: ProjectAuthContext): boolean {
    return auth.role === Role.SITE_ENGINEER;
  }

  /** Activities (Milestone) progress updates: PMC has always owned this; Site Engineer also
   * works the site day-to-day and can now log progress % + a remark the same way. */
  static canUpdateActivityProgress(auth: ProjectAuthContext): boolean {
    return auth.role === Role.PMC || auth.role === Role.SITE_ENGINEER;
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
      canSubmitForVerification: this.canSubmitForVerification(fakeAuth),
      canVerify: this.canVerify(fakeAuth),
      canBlockPayment: this.canBlockPayment(fakeAuth),
      canMarkPaid: this.canMarkPaid(fakeAuth),
      canUnblockPayment: this.canUnblockPayment(fakeAuth),
      canViewPayments: this.canViewPayments(fakeAuth),
      canExportAuditLog: this.canExportAuditLog(fakeAuth),
      canResolveFollowUp: this.canResolveFollowUp(fakeAuth),
      canAccessCashModule: this.canAccessCashModule(fakeAuth),
      canManageArtifacts: this.canManageArtifacts(fakeAuth),
      canManageRABill: this.canManageRABill(fakeAuth),
      canApproveRABill: this.canApproveRABill(fakeAuth),
      canSiteEngineerReviewRABill: this.canSiteEngineerReviewRABill(fakeAuth),
      canUploadProjectDocument: this.canUploadProjectDocument(fakeAuth),
      canViewChecklistsAndDPR: this.canViewChecklistsAndDPR(fakeAuth),
      canCreateChecklist: this.canCreateChecklist(fakeAuth),
      canFillChecklist: this.canFillChecklist(fakeAuth),
      canSignChecklist: this.canSignChecklist(fakeAuth),
      canFillDPR: this.canFillDPR(fakeAuth),
      canUpdateActivityProgress: this.canUpdateActivityProgress(fakeAuth),
      canViewProjectReport: this.canViewProjectReport(fakeAuth),
    };
  }
}
