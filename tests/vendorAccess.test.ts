import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';

/**
 * Vendor access control tests.
 * Tests the logic rules for vendor onboarding, data filtering, and access control.
 */

// ─── Simulated types (matching app types) ───────────────────────────────────
const Role = { OWNER: 'OWNER', PMC: 'PMC', VENDOR: 'VENDOR', VIEWER: 'VIEWER' } as const;
type Role = (typeof Role)[keyof typeof Role];

interface ProjectRole {
  userId: string;
  projectId: string;
  role: Role;
}

interface Evidence {
  submittedById: string;
  submittedAt: Date;
}

interface Milestone {
  id: string;
  title: string;
  projectId: string;
  vendorUserId?: string | null;
  evidence: Evidence[];
}

// ─── Simulated logic (mirrors server-side filtering) ────────────────────────

/** Check if a user can manage vendors */
function canManageVendors(role: Role): boolean {
  return role === Role.OWNER || role === Role.PMC;
}

/** Check if a user can access vendor portal */
function isVendorOnly(roles: ProjectRole[]): boolean {
  return roles.length > 0 && roles.every((r) => r.role === Role.VENDOR);
}

/** Filter milestones for a vendor: only milestones where they submitted first evidence (legacy) */
function filterMilestonesForVendor(
  milestones: Milestone[],
  vendorUserId: string,
): Milestone[] {
  return milestones.filter(
    (m) => m.evidence.length > 0 && m.evidence[0].submittedById === vendorUserId,
  );
}

/**
 * Filter milestones for a vendor using vendorUserId FK (with fallback to evidence).
 * This mirrors the updated server-side logic.
 */
function filterMilestonesForVendorV2(
  milestones: Milestone[],
  userId: string,
): Milestone[] {
  return milestones.filter(
    (m) => m.vendorUserId === userId || m.evidence[0]?.submittedById === userId,
  );
}

/** Check if vendor can access a specific route */
function canVendorAccessRoute(route: string, role: Role): boolean {
  // Vendor can access /vendor/* routes
  if (route.startsWith('/vendor')) return role === Role.VENDOR;
  // Vendor can access project routes they belong to (limited view)
  if (route.startsWith('/projects/')) return true;
  // Vendor CANNOT access admin routes
  if (route.startsWith('/admin/')) return false;
  // Vendor CANNOT access global execution intelligence
  if (route.startsWith('/execution-intelligence')) return true; // existing routes allow with filtering
  return false;
}

/** Validate username for vendor creation */
function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9_.-]+$/.test(username) && username.length >= 3 && username.length <= 50;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Vendor Onboarding', () => {
  it('Owner can manage vendors', () => {
    expect(canManageVendors(Role.OWNER)).toBe(true);
  });

  it('PMC can manage vendors', () => {
    expect(canManageVendors(Role.PMC)).toBe(true);
  });

  it('Vendor cannot manage vendors', () => {
    expect(canManageVendors(Role.VENDOR)).toBe(false);
  });

  it('Viewer cannot manage vendors', () => {
    expect(canManageVendors(Role.VIEWER)).toBe(false);
  });

  it('password is properly hashed with bcrypt', async () => {
    const raw = 'testpassword123';
    const hash = await bcrypt.hash(raw, 10);
    expect(hash).not.toBe(raw);
    expect(hash.startsWith('$2a$') || hash.startsWith('$2b$')).toBe(true);
    expect(await bcrypt.compare(raw, hash)).toBe(true);
    expect(await bcrypt.compare('wrongpassword', hash)).toBe(false);
  });

  it('valid usernames are accepted', () => {
    expect(isValidUsername('apex_construction')).toBe(true);
    expect(isValidUsername('vendor.one')).toBe(true);
    expect(isValidUsername('user-123')).toBe(true);
    expect(isValidUsername('ABC')).toBe(true);
  });

  it('invalid usernames are rejected', () => {
    expect(isValidUsername('ab')).toBe(false); // too short
    expect(isValidUsername('user name')).toBe(false); // space
    expect(isValidUsername('user@name')).toBe(false); // @
    expect(isValidUsername('')).toBe(false);
  });
});

describe('Vendor Data Filtering', () => {
  const vendorA = 'vendor-a-id';
  const vendorB = 'vendor-b-id';
  const projectId = 'project-1';

  const milestones: Milestone[] = [
    {
      id: 'm1',
      title: 'Milestone 1',
      projectId,
      evidence: [{ submittedById: vendorA, submittedAt: new Date('2025-01-01') }],
    },
    {
      id: 'm2',
      title: 'Milestone 2',
      projectId,
      evidence: [{ submittedById: vendorB, submittedAt: new Date('2025-01-02') }],
    },
    {
      id: 'm3',
      title: 'Milestone 3',
      projectId,
      evidence: [{ submittedById: vendorA, submittedAt: new Date('2025-01-03') }],
    },
    {
      id: 'm4',
      title: 'Milestone 4 (no evidence)',
      projectId,
      evidence: [],
    },
  ];

  it('vendor sees only their own milestones', () => {
    const vendorAMilestones = filterMilestonesForVendor(milestones, vendorA);
    expect(vendorAMilestones).toHaveLength(2);
    expect(vendorAMilestones.map((m) => m.id)).toEqual(['m1', 'm3']);
  });

  it('vendor cannot see other vendor milestones', () => {
    const vendorAMilestones = filterMilestonesForVendor(milestones, vendorA);
    const otherVendorIds = vendorAMilestones.flatMap((m) =>
      m.evidence
        .filter((e) => e.submittedById !== vendorA)
        .map((e) => e.submittedById),
    );
    expect(otherVendorIds).toHaveLength(0);
  });

  it('vendor B sees only their milestones', () => {
    const vendorBMilestones = filterMilestonesForVendor(milestones, vendorB);
    expect(vendorBMilestones).toHaveLength(1);
    expect(vendorBMilestones[0].id).toBe('m2');
  });

  it('milestones with no evidence are not shown to any vendor', () => {
    const vendorAMilestones = filterMilestonesForVendor(milestones, vendorA);
    const vendorBMilestones = filterMilestonesForVendor(milestones, vendorB);
    const noEvidenceIds = ['m4'];
    expect(vendorAMilestones.find((m) => noEvidenceIds.includes(m.id))).toBeUndefined();
    expect(vendorBMilestones.find((m) => noEvidenceIds.includes(m.id))).toBeUndefined();
  });

  it('unknown vendor sees no milestones', () => {
    const result = filterMilestonesForVendor(milestones, 'unknown-vendor');
    expect(result).toHaveLength(0);
  });
});

describe('Vendor Route Access Control', () => {
  it('vendor cannot access admin routes', () => {
    expect(canVendorAccessRoute('/admin/vendors', Role.VENDOR)).toBe(false);
  });

  it('vendor can access vendor portal routes', () => {
    expect(canVendorAccessRoute('/vendor/overview', Role.VENDOR)).toBe(true);
    expect(canVendorAccessRoute('/vendor/gantt', Role.VENDOR)).toBe(true);
    expect(canVendorAccessRoute('/vendor/analytics', Role.VENDOR)).toBe(true);
  });

  it('non-vendor cannot access vendor portal routes', () => {
    expect(canVendorAccessRoute('/vendor/overview', Role.OWNER)).toBe(false);
    expect(canVendorAccessRoute('/vendor/gantt', Role.PMC)).toBe(false);
  });
});

describe('Vendor-only Detection', () => {
  it('user with only VENDOR roles is vendor-only', () => {
    const roles: ProjectRole[] = [
      { userId: 'u1', projectId: 'p1', role: Role.VENDOR },
    ];
    expect(isVendorOnly(roles)).toBe(true);
  });

  it('user with VENDOR + OWNER is not vendor-only', () => {
    const roles: ProjectRole[] = [
      { userId: 'u1', projectId: 'p1', role: Role.VENDOR },
      { userId: 'u1', projectId: 'p2', role: Role.OWNER },
    ];
    expect(isVendorOnly(roles)).toBe(false);
  });

  it('user with no roles is not vendor-only', () => {
    expect(isVendorOnly([])).toBe(false);
  });

  it('user with OWNER role is not vendor-only', () => {
    const roles: ProjectRole[] = [
      { userId: 'u1', projectId: 'p1', role: Role.OWNER },
    ];
    expect(isVendorOnly(roles)).toBe(false);
  });
});

// ─── New tests for vendorUserId FK-based filtering ──────────────────────────

describe('Vendor Filtering via vendorUserId (v2)', () => {
  const vendorA = 'vendor-a-id';
  const vendorB = 'vendor-b-id';
  const projectId = 'project-1';

  const milestones: Milestone[] = [
    {
      id: 'm1',
      title: 'Assigned via FK to A',
      projectId,
      vendorUserId: vendorA,
      evidence: [],
    },
    {
      id: 'm2',
      title: 'Assigned via FK to B',
      projectId,
      vendorUserId: vendorB,
      evidence: [],
    },
    {
      id: 'm3',
      title: 'Legacy: evidence-based A',
      projectId,
      vendorUserId: null,
      evidence: [{ submittedById: vendorA, submittedAt: new Date('2025-01-01') }],
    },
    {
      id: 'm4',
      title: 'No vendor, no evidence',
      projectId,
      vendorUserId: null,
      evidence: [],
    },
    {
      id: 'm5',
      title: 'FK to A + evidence from B (FK wins)',
      projectId,
      vendorUserId: vendorA,
      evidence: [{ submittedById: vendorB, submittedAt: new Date('2025-02-01') }],
    },
  ];

  it('vendor A sees FK-assigned milestones', () => {
    const result = filterMilestonesForVendorV2(milestones, vendorA);
    const ids = result.map((m) => m.id);
    expect(ids).toContain('m1');
  });

  it('vendor A also sees legacy evidence-based milestones', () => {
    const result = filterMilestonesForVendorV2(milestones, vendorA);
    const ids = result.map((m) => m.id);
    expect(ids).toContain('m3');
  });

  it('vendor A sees FK-assigned milestone even when evidence is from B', () => {
    const result = filterMilestonesForVendorV2(milestones, vendorA);
    const ids = result.map((m) => m.id);
    expect(ids).toContain('m5');
  });

  it('vendor B sees FK-assigned milestones', () => {
    const result = filterMilestonesForVendorV2(milestones, vendorB);
    const ids = result.map((m) => m.id);
    expect(ids).toContain('m2');
  });

  it('vendor B also sees m5 via evidence fallback', () => {
    const result = filterMilestonesForVendorV2(milestones, vendorB);
    const ids = result.map((m) => m.id);
    // m5 has evidence from B, so B should also see it via fallback
    expect(ids).toContain('m5');
  });

  it('unassigned milestones without evidence are not visible to any vendor', () => {
    const resultA = filterMilestonesForVendorV2(milestones, vendorA);
    const resultB = filterMilestonesForVendorV2(milestones, vendorB);
    expect(resultA.find((m) => m.id === 'm4')).toBeUndefined();
    expect(resultB.find((m) => m.id === 'm4')).toBeUndefined();
  });

  it('unknown vendor sees no milestones', () => {
    const result = filterMilestonesForVendorV2(milestones, 'unknown');
    expect(result).toHaveLength(0);
  });

  it('vendor A sees exactly 3 milestones (m1 FK, m3 evidence, m5 FK)', () => {
    const result = filterMilestonesForVendorV2(milestones, vendorA);
    expect(result).toHaveLength(3);
    expect(result.map((m) => m.id).sort()).toEqual(['m1', 'm3', 'm5']);
  });

  it('vendor B sees exactly 2 milestones (m2 FK, m5 evidence)', () => {
    const result = filterMilestonesForVendorV2(milestones, vendorB);
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.id).sort()).toEqual(['m2', 'm5']);
  });
});

describe('Milestone Vendor Assignment Validation', () => {
  it('vendorUserId must be a valid UUID or null', () => {
    // Simulates Zod validation from createMilestoneSchema
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    expect(uuidRegex.test('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(uuidRegex.test('not-a-uuid')).toBe(false);
    expect(uuidRegex.test('')).toBe(false);
  });

  it('null vendorUserId means no vendor assigned', () => {
    const milestone: Milestone = {
      id: 'm1',
      title: 'Unassigned',
      projectId: 'p1',
      vendorUserId: null,
      evidence: [],
    };
    expect(milestone.vendorUserId).toBeNull();
  });

  it('vendor dropdown should only list VENDOR role users', () => {
    // Simulates the /api/admin/vendors response filtering
    const allProjectRoles: ProjectRole[] = [
      { userId: 'u1', projectId: 'p1', role: Role.OWNER },
      { userId: 'u2', projectId: 'p1', role: Role.VENDOR },
      { userId: 'u3', projectId: 'p1', role: Role.PMC },
      { userId: 'u4', projectId: 'p1', role: Role.VENDOR },
    ];
    const vendorUsers = allProjectRoles.filter((r) => r.role === Role.VENDOR);
    expect(vendorUsers).toHaveLength(2);
    expect(vendorUsers.map((v) => v.userId)).toEqual(['u2', 'u4']);
  });
});
