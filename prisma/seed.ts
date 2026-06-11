import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ─── String-based enums (matches src/types/index.ts) ────────────────────────
// App uses 'CLIENT' as the project-owner role throughout (types/index.ts, all API routes)
const Role = { OWNER: 'CLIENT', PMC: 'PMC', VENDOR: 'VENDOR', VIEWER: 'VIEWER', CONSULTANT: 'CONSULTANT' } as const;
const BOQStatus = { DRAFT: 'DRAFT', APPROVED: 'APPROVED', REVISED: 'REVISED' } as const;
const MilestoneState = {
  DRAFT: 'DRAFT', IN_PROGRESS: 'IN_PROGRESS', SUBMITTED: 'SUBMITTED',
  VERIFIED: 'VERIFIED', CLOSED: 'CLOSED',
} as const;
const PaymentModel = {
  ADVANCE: 'ADVANCE', PROGRESS_BASED: 'PROGRESS_BASED',
  MILESTONE_COMPLETE: 'MILESTONE_COMPLETE', RETENTION: 'RETENTION',
} as const;
const EvidenceStatus = { SUBMITTED: 'SUBMITTED', APPROVED: 'APPROVED', REJECTED: 'REJECTED' } as const;
const EligibilityState = {
  NOT_DUE: 'NOT_DUE', DUE_PENDING_VERIFICATION: 'DUE_PENDING_VERIFICATION',
  FULLY_ELIGIBLE: 'FULLY_ELIGIBLE', BLOCKED: 'BLOCKED', MARKED_PAID: 'MARKED_PAID',
} as const;

// ─── Date helpers ────────────────────────────────────────────────────────────
const now = new Date();
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
const daysFromNow = (d: number) => new Date(now.getTime() + d * 86_400_000);

// ─── Main seed ───────────────────────────────────────────────────────────────
async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('SEED ABORTED: NODE_ENV is production.');
    process.exit(1);
  }

  console.log('🌱 Seeding Axinfra database with PHASE-WISE data…\n');

  // ── 1. Wipe all data (respects FK order) ─────────────────────────────────
  console.log('  Clearing existing data…');
  await prisma.vendorRequestFile.deleteMany();
  await prisma.vendorRequest.deleteMany();
  await prisma.drawingVersion.deleteMany();
  await prisma.drawingRow.deleteMany();
  await prisma.setRequest.deleteMany();
  await prisma.drawingSet.deleteMany();
  await prisma.privateCostEntry.deleteMany();
  await prisma.cashAdjustment.deleteMany();
  await prisma.systemEvent.deleteMany();
  await prisma.projectMetrics.deleteMany();
  await prisma.vendorMetrics.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.followUp.deleteMany();
  await prisma.eligibilityEvent.deleteMany();
  await prisma.paymentEligibility.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.evidenceFile.deleteMany();
  await prisma.evidence.deleteMany();
  await prisma.milestoneStateTransition.deleteMany();
  await prisma.milestoneBOQLink.deleteMany();
  await prisma.milestoneDependency.deleteMany();
  await prisma.milestone.deleteMany();
  await prisma.bOQRevision.deleteMany();
  await prisma.bOQItem.deleteMany();
  await prisma.bOQ.deleteMany();
  await prisma.phase.deleteMany();
  await prisma.customView.deleteMany();
  await prisma.projectScheduleConfig.deleteMany();
  await prisma.projectRole.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
  console.log('  Done.\n');

  // ── 2. Users ─────────────────────────────────────────────────────────────
  const hash = await bcrypt.hash('password123', 10);
  const adminHash = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.create({
    data: { name: 'Admin', email: 'admin@axinfra.local', hashedPassword: adminHash },
  });
  const owner = await prisma.user.create({
    data: { name: 'Alex Client', email: 'client@example.com', hashedPassword: hash, preferredRole: 'CLIENT' },
  });
  const pmc = await prisma.user.create({
    data: { name: 'Pat PMC', email: 'pmc@example.com', hashedPassword: hash, preferredRole: 'PMC' },
  });
  const vendor1 = await prisma.user.create({
    data: { name: 'Victor Vendor', email: 'vendor@example.com', hashedPassword: hash, preferredRole: 'VENDOR' },
  });
  const vendor2 = await prisma.user.create({
    data: { name: 'Sara Subcon', email: 'vendor2@example.com', hashedPassword: hash, preferredRole: 'VENDOR' },
  });
  const viewer = await prisma.user.create({
    data: { name: 'Vera Viewer', email: 'viewer@example.com', hashedPassword: hash, preferredRole: 'VIEWER' },
  });
  const consultant = await prisma.user.create({
    data: { name: 'Arthur Consultant', email: 'consultant@example.com', hashedPassword: hash, preferredRole: 'CONSULTANT' },
  });
  console.log('  Created 7 users (1 admin + 6 demo)');

  async function seedArchitectureForProject(projectId: string, label: string) {
    const draftSet = await prisma.drawingSet.create({
      data: {
        projectId,
        name: `${label} - Working Drawing Set A`,
        description: 'Core architectural package for review',
        cost: 90000,
        currency: 'INR',
        status: 'DRAFT',
        createdById: consultant.id,
      },
    });

    const requestedSet = await prisma.drawingSet.create({
      data: {
        projectId,
        name: `${label} - Working Drawing Set B`,
        description: 'PMC-requested revision package',
        cost: 125000,
        currency: 'INR',
        status: 'REQUESTED',
        createdById: consultant.id,
        requestedById: pmc.id,
        requestedAt: daysAgo(4),
        dueDate: daysFromNow(8),
      },
    });

    const approvedSet = await prisma.drawingSet.create({
      data: {
        projectId,
        name: `${label} - Working Drawing Set C`,
        description: 'Approved package ready for owner payment',
        cost: 150000,
        currency: 'INR',
        status: 'APPROVED',
        createdById: consultant.id,
        requestedById: pmc.id,
        requestedAt: daysAgo(20),
        deliveredAt: daysAgo(14),
        approvedAt: daysAgo(10),
      },
    });

    const rowA = await prisma.drawingRow.create({
      data: {
        projectId,
        setId: requestedSet.id,
        serialNo: 1,
        category: 'Plans',
        name: 'Ground Floor Layout',
        floor: 'GROUND_FLOOR',
        description: 'Updated layout with circulation revision',
        status: 'SUBMITTED',
        dueDate: daysFromNow(8),
        createdById: consultant.id,
      },
    });
    await prisma.drawingVersion.create({
      data: {
        drawingRowId: rowA.id,
        versionNumber: 1,
        uploadType: 'URL',
        fileUrl: 'https://example.com/drawings/ground-floor-layout-v1.pdf',
        fileName: 'ground-floor-layout-v1.pdf',
        uploadedById: consultant.id,
        reviewStatus: 'PENDING',
        isCurrent: true,
      },
    });

    const rowB = await prisma.drawingRow.create({
      data: {
        projectId,
        setId: approvedSet.id,
        serialNo: 2,
        category: 'Sections',
        name: 'Section A-A',
        floor: 'ALL_FLOORS',
        description: 'Final coordinated section',
        status: 'APPROVED',
        createdById: consultant.id,
      },
    });
    await prisma.drawingVersion.create({
      data: {
        drawingRowId: rowB.id,
        versionNumber: 2,
        uploadType: 'URL',
        fileUrl: 'https://example.com/drawings/section-aa-v2.pdf',
        fileName: 'section-aa-v2.pdf',
        uploadedById: consultant.id,
        reviewStatus: 'APPROVED',
        reviewedById: pmc.id,
        reviewedAt: daysAgo(11),
        isCurrent: true,
      },
    });

    const rowC = await prisma.drawingRow.create({
      data: {
        projectId,
        setId: draftSet.id,
        serialNo: 3,
        category: 'Elevations',
        name: 'South Elevation',
        floor: 'ALL_FLOORS',
        description: 'Facade control line draft',
        status: 'PENDING',
        createdById: consultant.id,
      },
    });
    await prisma.drawingVersion.create({
      data: {
        drawingRowId: rowC.id,
        versionNumber: 0,
        uploadType: 'URL',
        fileUrl: 'https://example.com/drawings/south-elevation-v0.pdf',
        fileName: 'south-elevation-v0.pdf',
        uploadedById: consultant.id,
        reviewStatus: 'REJECTED',
        reviewedById: pmc.id,
        reviewedAt: daysAgo(7),
        rejectionReason: 'Please align facade grid with structural column lines',
        isCurrent: true,
      },
    });

    await prisma.setRequest.create({
      data: {
        setId: requestedSet.id,
        projectId,
        requestedById: pmc.id,
        requestedAt: daysAgo(4),
        dueDate: daysFromNow(8),
        note: 'Need updated layout + services coordination',
        status: 'ACCEPTED',
      },
    });

    await prisma.auditLog.createMany({
      data: [
        {
          projectId,
          actorId: consultant.id,
          role: Role.CONSULTANT,
          actionType: 'PROJECT_UPDATE',
          entityType: 'DrawingSet',
          entityId: draftSet.id,
          afterJson: JSON.stringify({ name: draftSet.name, status: draftSet.status, cost: draftSet.cost }),
          createdAt: daysAgo(25),
        },
        {
          projectId,
          actorId: pmc.id,
          role: Role.PMC,
          actionType: 'PROJECT_UPDATE',
          entityType: 'SetRequest',
          entityId: requestedSet.id,
          afterJson: JSON.stringify({ setId: requestedSet.id, dueDate: daysFromNow(8).toISOString(), status: 'REQUESTED' }),
          reason: 'Request drawings for review',
          createdAt: daysAgo(4),
        },
        {
          projectId,
          actorId: owner.id,
          role: Role.OWNER,
          actionType: 'PROJECT_UPDATE',
          entityType: 'DrawingSet',
          entityId: approvedSet.id,
          afterJson: JSON.stringify({ status: approvedSet.status, approvedAt: approvedSet.approvedAt?.toISOString() ?? null }),
          createdAt: daysAgo(10),
        },
      ],
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PROJECT 1 — Downtown Office Building
  // 4 Phases: Foundation → Structure → MEP → Finishing
  // Each Phase has its own BOQ + milestones
  // ════════════════════════════════════════════════════════════════════════════
  const p1 = await prisma.project.create({
    data: {
      name: 'Downtown Office Building',
      description: 'A 10-story office building construction project in the downtown area.',
      isExampleProject: true,
    },
  });

  await prisma.projectRole.createMany({
    data: [
      { projectId: p1.id, userId: admin.id, role: Role.OWNER },
      { projectId: p1.id, userId: owner.id, role: Role.OWNER },
      { projectId: p1.id, userId: pmc.id, role: Role.PMC },
      { projectId: p1.id, userId: vendor1.id, role: Role.VENDOR },
      { projectId: p1.id, userId: vendor2.id, role: Role.VENDOR },
      { projectId: p1.id, userId: viewer.id, role: Role.VIEWER },
      { projectId: p1.id, userId: consultant.id, role: Role.CONSULTANT },
    ],
  });

  await prisma.projectScheduleConfig.create({
    data: {
      projectId: p1.id,
      projectStartDate: daysAgo(90),
      dailyOverheadCost: 5000,
      penaltyRatePerDay: 0.001,
      opportunityCostFactor: 1.2,
    },
  });

  // ── PHASE 0 — Foundation (APPROVED BOQ, all milestones CLOSED) ───────────
  const p1_phase0 = await prisma.phase.create({
    data: { projectId: p1.id, name: 'Phase 0 — Foundation', sortOrder: 0 },
  });

  const p1_boq0 = await prisma.bOQ.create({
    data: {
      projectId: p1.id,
      phaseId: p1_phase0.id,
      status: BOQStatus.APPROVED,
    },
  });

  const [p1_b0i1, p1_b0i2] = await Promise.all([
    prisma.bOQItem.create({
      data: { boqId: p1_boq0.id, description: 'Foundation concrete work', unit: 'cum', plannedQty: 500, rate: 150, plannedValue: 75000 },
    }),
    prisma.bOQItem.create({
      data: { boqId: p1_boq0.id, description: 'Waterproofing membrane', unit: 'sqm', plannedQty: 800, rate: 50, plannedValue: 40000 },
    }),
  ]);

  // Phase 0 — M1: Foundation Work (CLOSED)
  const p1_ph0_m1 = await prisma.milestone.create({
    data: {
      projectId: p1.id,
      phaseId: p1_phase0.id,
      title: 'Foundation Work',
      description: 'Complete foundation concrete work — all 500 cum poured and cured',
      paymentModel: PaymentModel.MILESTONE_COMPLETE,
      plannedStart: daysAgo(85), plannedEnd: daysAgo(60),
      baselinePlannedStart: daysAgo(85), baselinePlannedEnd: daysAgo(60),
      actualStart: daysAgo(82), actualSubmission: daysAgo(63), actualVerification: daysAgo(60),
      state: MilestoneState.CLOSED, value: 75000, advancePercent: 10,
      vendorUserId: vendor1.id, sortOrder: 1,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p1_ph0_m1.id, boqItemId: p1_b0i1.id, plannedQty: 500 } });
  await prisma.milestoneStateTransition.createMany({
    data: [
      { milestoneId: p1_ph0_m1.id, fromState: null, toState: 'DRAFT', actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(88) },
      { milestoneId: p1_ph0_m1.id, fromState: 'DRAFT', toState: 'IN_PROGRESS', actorId: vendor1.id, role: Role.VENDOR, createdAt: daysAgo(82) },
      { milestoneId: p1_ph0_m1.id, fromState: 'IN_PROGRESS', toState: 'SUBMITTED', actorId: vendor1.id, role: Role.VENDOR, createdAt: daysAgo(63) },
      { milestoneId: p1_ph0_m1.id, fromState: 'SUBMITTED', toState: 'VERIFIED', actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(61) },
      { milestoneId: p1_ph0_m1.id, fromState: 'VERIFIED', toState: 'CLOSED', actorId: owner.id, role: Role.OWNER, createdAt: daysAgo(60) },
    ],
  });
  await prisma.evidence.create({
    data: { milestoneId: p1_ph0_m1.id, submittedById: vendor1.id, qtyOrPercent: 100, remarks: 'Foundation complete — all 500 cum poured and cured.', frozen: true, status: EvidenceStatus.APPROVED, reviewedAt: daysAgo(61) },
  });
  await prisma.verification.create({
    data: { milestoneId: p1_ph0_m1.id, verifiedById: pmc.id, qtyVerified: 500, valueEligibleComputed: 75000 },
  });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p1_ph0_m1.id, boqValueCompleted: 75000, eligibleAmount: 75000,
      advanceAmount: 7500, remainingAmount: 0,
      state: EligibilityState.MARKED_PAID, dueDate: daysAgo(60),
      markedPaidAt: daysAgo(58), markedPaidByActorId: owner.id,
      paidExplanation: 'Payment processed via bank transfer',
    },
  });

  // Phase 0 — M2: Waterproofing (CLOSED)
  const p1_ph0_m2 = await prisma.milestone.create({
    data: {
      projectId: p1.id,
      phaseId: p1_phase0.id,
      title: 'Waterproofing Membrane',
      description: 'Waterproofing membrane application on all below-grade surfaces',
      paymentModel: PaymentModel.MILESTONE_COMPLETE,
      plannedStart: daysAgo(62), plannedEnd: daysAgo(52),
      baselinePlannedStart: daysAgo(62), baselinePlannedEnd: daysAgo(52),
      actualStart: daysAgo(60), actualSubmission: daysAgo(54), actualVerification: daysAgo(52),
      state: MilestoneState.CLOSED, value: 40000,
      vendorUserId: vendor1.id, sortOrder: 2,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p1_ph0_m2.id, boqItemId: p1_b0i2.id, plannedQty: 800 } });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p1_ph0_m2.id, boqValueCompleted: 40000, eligibleAmount: 40000,
      state: EligibilityState.MARKED_PAID, dueDate: daysAgo(52),
      markedPaidAt: daysAgo(50), markedPaidByActorId: owner.id,
    },
  });

  console.log('    ✓ Phase 0 — Foundation (2 milestones, BOQ APPROVED)');

  // ── PHASE 1 — Structural Works (APPROVED BOQ, mixed states) ──────────────
  const p1_phase1 = await prisma.phase.create({
    data: { projectId: p1.id, name: 'Phase 1 — Structural Works', sortOrder: 1 },
  });

  const p1_boq1 = await prisma.bOQ.create({
    data: {
      projectId: p1.id,
      phaseId: p1_phase1.id,
      status: BOQStatus.APPROVED,
    },
  });

  const [p1_b1i1, p1_b1i2] = await Promise.all([
    prisma.bOQItem.create({
      data: { boqId: p1_boq1.id, description: 'Structural steel framework', unit: 'MT', plannedQty: 200, rate: 2500, plannedValue: 500000 },
    }),
    prisma.bOQItem.create({
      data: { boqId: p1_boq1.id, description: 'Floor slab casting', unit: 'sqm', plannedQty: 5000, rate: 80, plannedValue: 400000 },
    }),
  ]);

  // Phase 1 — M1: Steel Framework (VERIFIED)
  const p1_ph1_m1 = await prisma.milestone.create({
    data: {
      projectId: p1.id,
      phaseId: p1_phase1.id,
      title: 'Structural Framework — Floors 1-5',
      description: 'Steel framework for floors 1-5',
      paymentModel: PaymentModel.PROGRESS_BASED,
      plannedStart: daysAgo(50), plannedEnd: daysAgo(20),
      baselinePlannedStart: daysAgo(50), baselinePlannedEnd: daysAgo(22),
      actualStart: daysAgo(48), actualSubmission: daysAgo(22), actualVerification: daysAgo(18),
      state: MilestoneState.VERIFIED, value: 250000, advancePercent: 15,
      vendorUserId: vendor1.id, sortOrder: 1,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p1_ph1_m1.id, boqItemId: p1_b1i1.id, plannedQty: 100 } });
  await prisma.milestoneStateTransition.createMany({
    data: [
      { milestoneId: p1_ph1_m1.id, fromState: null, toState: 'DRAFT', actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(52) },
      { milestoneId: p1_ph1_m1.id, fromState: 'DRAFT', toState: 'IN_PROGRESS', actorId: vendor1.id, role: Role.VENDOR, createdAt: daysAgo(48) },
      { milestoneId: p1_ph1_m1.id, fromState: 'IN_PROGRESS', toState: 'SUBMITTED', actorId: vendor1.id, role: Role.VENDOR, createdAt: daysAgo(22) },
      { milestoneId: p1_ph1_m1.id, fromState: 'SUBMITTED', toState: 'VERIFIED', actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(18) },
    ],
  });
  await prisma.evidence.create({
    data: { milestoneId: p1_ph1_m1.id, submittedById: vendor1.id, qtyOrPercent: 100, remarks: 'Floors 1-5 steel framework completed', frozen: true, status: EvidenceStatus.APPROVED, reviewedAt: daysAgo(19) },
  });
  await prisma.verification.create({
    data: { milestoneId: p1_ph1_m1.id, verifiedById: pmc.id, qtyVerified: 100, valueEligibleComputed: 250000 },
  });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p1_ph1_m1.id, boqValueCompleted: 250000, eligibleAmount: 250000,
      advanceAmount: 37500, remainingAmount: 212500,
      state: EligibilityState.FULLY_ELIGIBLE, dueDate: daysFromNow(3),
    },
  });

  // Phase 1 — M2: Floor Slab L1-3 (SUBMITTED)
  const p1_ph1_m2 = await prisma.milestone.create({
    data: {
      projectId: p1.id,
      phaseId: p1_phase1.id,
      title: 'Floor Slab — Levels 1-3',
      description: 'Concrete slab casting for floors 1-3',
      paymentModel: PaymentModel.MILESTONE_COMPLETE,
      plannedStart: daysAgo(25), plannedEnd: daysFromNow(5),
      baselinePlannedStart: daysAgo(25), baselinePlannedEnd: daysFromNow(3),
      actualStart: daysAgo(20), actualSubmission: daysAgo(3),
      state: MilestoneState.SUBMITTED, value: 120000,
      vendorUserId: vendor2.id, sortOrder: 2,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p1_ph1_m2.id, boqItemId: p1_b1i2.id, plannedQty: 1500 } });
  await prisma.milestoneStateTransition.createMany({
    data: [
      { milestoneId: p1_ph1_m2.id, fromState: null, toState: 'DRAFT', actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(27) },
      { milestoneId: p1_ph1_m2.id, fromState: 'DRAFT', toState: 'IN_PROGRESS', actorId: vendor2.id, role: Role.VENDOR, createdAt: daysAgo(20) },
      { milestoneId: p1_ph1_m2.id, fromState: 'IN_PROGRESS', toState: 'SUBMITTED', actorId: vendor2.id, role: Role.VENDOR, createdAt: daysAgo(3) },
    ],
  });
  await prisma.evidence.create({
    data: { milestoneId: p1_ph1_m2.id, submittedById: vendor2.id, qtyOrPercent: 100, remarks: 'Slab casting complete for L1-L3', frozen: true, status: EvidenceStatus.SUBMITTED, submittedAt: daysAgo(3) },
  });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p1_ph1_m2.id, remainingAmount: 120000,
      state: EligibilityState.DUE_PENDING_VERIFICATION, dueDate: daysFromNow(5),
    },
  });

  console.log('    ✓ Phase 1 — Structural Works (2 milestones, BOQ APPROVED)');

  // ── PHASE 2 — Facade & MEP (APPROVED BOQ, IN_PROGRESS + DRAFT) ───────────
  const p1_phase2 = await prisma.phase.create({
    data: { projectId: p1.id, name: 'Phase 2 — Facade & MEP', sortOrder: 2 },
  });

  const p1_boq2 = await prisma.bOQ.create({
    data: {
      projectId: p1.id,
      phaseId: p1_phase2.id,
      status: BOQStatus.APPROVED,
    },
  });

  const [p1_b2i1, p1_b2i2] = await Promise.all([
    prisma.bOQItem.create({
      data: { boqId: p1_boq2.id, description: 'External glazing', unit: 'sqm', plannedQty: 2000, rate: 200, plannedValue: 400000 },
    }),
    prisma.bOQItem.create({
      data: { boqId: p1_boq2.id, description: 'MEP installations', unit: 'LS', plannedQty: 1, rate: 300000, plannedValue: 300000 },
    }),
  ]);

  // Phase 2 — M1: External Glazing (IN_PROGRESS)
  const p1_ph2_m1 = await prisma.milestone.create({
    data: {
      projectId: p1.id,
      phaseId: p1_phase2.id,
      title: 'External Glazing — South Facade',
      description: 'Installation of external glazing on south-facing facade',
      paymentModel: PaymentModel.PROGRESS_BASED,
      plannedStart: daysAgo(12), plannedEnd: daysFromNow(30),
      baselinePlannedStart: daysAgo(12), baselinePlannedEnd: daysFromNow(28),
      actualStart: daysAgo(10),
      state: MilestoneState.IN_PROGRESS, value: 100000, advancePercent: 20,
      vendorUserId: vendor2.id, sortOrder: 1,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p1_ph2_m1.id, boqItemId: p1_b2i1.id, plannedQty: 500 } });
  await prisma.milestoneStateTransition.createMany({
    data: [
      { milestoneId: p1_ph2_m1.id, fromState: null, toState: 'DRAFT', actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(15) },
      { milestoneId: p1_ph2_m1.id, fromState: 'DRAFT', toState: 'IN_PROGRESS', actorId: vendor2.id, role: Role.VENDOR, createdAt: daysAgo(10) },
    ],
  });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p1_ph2_m1.id, advanceAmount: 20000, remainingAmount: 80000,
      state: EligibilityState.NOT_DUE, dueDate: daysFromNow(30),
    },
  });

  // Phase 2 — M2: MEP Rough-In (DRAFT, unassigned)
  const p1_ph2_m2 = await prisma.milestone.create({
    data: {
      projectId: p1.id,
      phaseId: p1_phase2.id,
      title: 'MEP Rough-In',
      description: 'Mechanical, Electrical, and Plumbing rough-in work',
      paymentModel: PaymentModel.ADVANCE,
      plannedStart: daysFromNow(20), plannedEnd: daysFromNow(45),
      baselinePlannedStart: daysFromNow(20), baselinePlannedEnd: daysFromNow(45),
      state: MilestoneState.DRAFT, value: 300000, advancePercent: 25,
      sortOrder: 2,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p1_ph2_m2.id, boqItemId: p1_b2i2.id, plannedQty: 1 } });
  await prisma.milestoneStateTransition.create({
    data: { milestoneId: p1_ph2_m2.id, fromState: null, toState: 'DRAFT', actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(5) },
  });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p1_ph2_m2.id, advanceAmount: 75000, remainingAmount: 225000,
      state: EligibilityState.NOT_DUE, dueDate: daysFromNow(45),
    },
  });

  console.log('    ✓ Phase 2 — Facade & MEP (2 milestones, BOQ APPROVED)');

  // ── PHASE 3 — Finishing (DRAFT BOQ — not yet approved) ───────────────────
  const p1_phase3 = await prisma.phase.create({
    data: { projectId: p1.id, name: 'Phase 3 — Finishing & Handover', sortOrder: 3 },
  });

  const p1_boq3 = await prisma.bOQ.create({
    data: {
      projectId: p1.id,
      phaseId: p1_phase3.id,
      status: BOQStatus.DRAFT,
    },
  });

  await prisma.bOQItem.create({
    data: { boqId: p1_boq3.id, description: 'Interior finishes and fit-out', unit: 'sqm', plannedQty: 8000, rate: 120, plannedValue: 960000 },
  });
  await prisma.bOQItem.create({
    data: { boqId: p1_boq3.id, description: 'Lift installation and commissioning', unit: 'nos', plannedQty: 4, rate: 80000, plannedValue: 320000 },
  });

  const p1_ph3_m1 = await prisma.milestone.create({
    data: {
      projectId: p1.id,
      phaseId: p1_phase3.id,
      title: 'Interior Fit-Out — Floors 1-5',
      description: 'Complete interior finishing works for floors 1 to 5',
      paymentModel: PaymentModel.PROGRESS_BASED,
      plannedStart: daysFromNow(50), plannedEnd: daysFromNow(90),
      baselinePlannedStart: daysFromNow(50), baselinePlannedEnd: daysFromNow(90),
      state: MilestoneState.DRAFT, value: 480000,
      sortOrder: 1,
    },
  });
  await prisma.milestoneStateTransition.create({
    data: { milestoneId: p1_ph3_m1.id, fromState: null, toState: 'DRAFT', actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(2) },
  });
  await prisma.paymentEligibility.create({
    data: { milestoneId: p1_ph3_m1.id, state: EligibilityState.NOT_DUE, dueDate: daysFromNow(90) },
  });

  console.log('    ✓ Phase 3 — Finishing (1 milestone, BOQ DRAFT — awaiting approval)');

  // ── P1 Extra Milestone (no phaseId — tests isExtra = true) ───────────────
  const p1_extra = await prisma.milestone.create({
    data: {
      projectId: p1.id,
      phaseId: null,
      title: 'Additional Parking Level — B3',
      description: 'Extra basement parking level requested by client after BOQ approval',
      paymentModel: PaymentModel.MILESTONE_COMPLETE,
      plannedStart: daysFromNow(60), plannedEnd: daysFromNow(100),
      baselinePlannedStart: daysFromNow(60), baselinePlannedEnd: daysFromNow(100),
      state: MilestoneState.DRAFT,
      isExtra: true,
      value: 180000,
      sortOrder: 99,
    },
  });
  await prisma.milestoneStateTransition.create({
    data: { milestoneId: p1_extra.id, fromState: null, toState: 'DRAFT', actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(1) },
  });
  await prisma.paymentEligibility.create({
    data: { milestoneId: p1_extra.id, state: EligibilityState.NOT_DUE, dueDate: daysFromNow(100) },
  });

  console.log('    ✓ Extra milestone (isExtra=true, no phase, awaiting owner approval)');

  // ── P1 Dependencies ───────────────────────────────────────────────────────
  await prisma.milestoneDependency.createMany({
    data: [
      { predecessorId: p1_ph0_m1.id, successorId: p1_ph0_m2.id, dependencyType: 'FS', lagDays: 0 },
      { predecessorId: p1_ph0_m2.id, successorId: p1_ph1_m1.id, dependencyType: 'FS', lagDays: 5 },
      { predecessorId: p1_ph1_m1.id, successorId: p1_ph1_m2.id, dependencyType: 'FS', lagDays: 2 },
      { predecessorId: p1_ph1_m2.id, successorId: p1_ph2_m1.id, dependencyType: 'FS', lagDays: 0 },
      { predecessorId: p1_ph2_m1.id, successorId: p1_ph2_m2.id, dependencyType: 'FS', lagDays: 5 },
      { predecessorId: p1_ph2_m2.id, successorId: p1_ph3_m1.id, dependencyType: 'FS', lagDays: 0 },
    ],
  });

  console.log('  ✅ Project 1: Downtown Office Building');
  console.log('     4 Phases | 4 BOQs (3 APPROVED, 1 DRAFT) | 7 Milestones | 1 Extra\n');
  await seedArchitectureForProject(p1.id, 'Downtown');
  console.log('     + Architecture demo: sets, rows, versions, set request, audit logs\n');

  // ════════════════════════════════════════════════════════════════════════════
  // PROJECT 2 — Riverfront Residential Towers
  // 3 Phases: Foundation → Superstructure → Finishing
  // ════════════════════════════════════════════════════════════════════════════
  const p2 = await prisma.project.create({
    data: {
      name: 'Riverfront Residential Towers',
      description: 'Twin 25-story luxury residential towers with shared podium.',
      isExampleProject: true,
    },
  });

  await prisma.projectRole.createMany({
    data: [
      { projectId: p2.id, userId: owner.id, role: Role.OWNER },
      { projectId: p2.id, userId: pmc.id, role: Role.PMC },
      { projectId: p2.id, userId: vendor1.id, role: Role.VENDOR },
      { projectId: p2.id, userId: viewer.id, role: Role.VIEWER },
      { projectId: p2.id, userId: consultant.id, role: Role.CONSULTANT },
    ],
  });

  await prisma.projectScheduleConfig.create({
    data: {
      projectId: p2.id,
      projectStartDate: daysAgo(120),
      dailyOverheadCost: 12000,
      penaltyRatePerDay: 0.002,
      opportunityCostFactor: 1.5,
    },
  });

  // ── Phase 0 — Piling & Foundation (APPROVED) ─────────────────────────────
  const p2_phase0 = await prisma.phase.create({
    data: { projectId: p2.id, name: 'Phase 0 — Piling & Foundation', sortOrder: 0 },
  });

  const p2_boq0 = await prisma.bOQ.create({
    data: { projectId: p2.id, phaseId: p2_phase0.id, status: BOQStatus.APPROVED },
  });

  const [p2_b0i1] = await Promise.all([
    prisma.bOQItem.create({
      data: { boqId: p2_boq0.id, description: 'Piling and foundation works', unit: 'LS', plannedQty: 1, rate: 2000000, plannedValue: 2000000 },
    }),
  ]);

  // Mobilization (CLOSED)
  const p2m1 = await prisma.milestone.create({
    data: {
      projectId: p2.id, phaseId: p2_phase0.id,
      title: 'Advance Payment — Mobilization',
      description: '20% advance for contractor mobilization',
      paymentModel: PaymentModel.ADVANCE,
      plannedStart: daysAgo(120), plannedEnd: daysAgo(90),
      baselinePlannedStart: daysAgo(120), baselinePlannedEnd: daysAgo(90),
      state: MilestoneState.CLOSED, value: 500000, advancePercent: 100,
      vendorUserId: vendor1.id, sortOrder: 1,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p2m1.id, boqItemId: p2_b0i1.id, plannedQty: 0.2 } });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p2m1.id, boqValueCompleted: 500000, eligibleAmount: 500000,
      advanceAmount: 500000, state: EligibilityState.MARKED_PAID,
      markedPaidAt: daysAgo(88), markedPaidByActorId: owner.id,
    },
  });

  // Piling Tower A (VERIFIED, BLOCKED)
  const p2m2 = await prisma.milestone.create({
    data: {
      projectId: p2.id, phaseId: p2_phase0.id,
      title: 'Piling Work — Tower A',
      description: 'Complete piling for Tower A foundation',
      paymentModel: PaymentModel.MILESTONE_COMPLETE,
      plannedStart: daysAgo(90), plannedEnd: daysAgo(50),
      baselinePlannedStart: daysAgo(90), baselinePlannedEnd: daysAgo(55),
      actualStart: daysAgo(85), actualSubmission: daysAgo(55), actualVerification: daysAgo(50),
      state: MilestoneState.VERIFIED, value: 800000, advancePercent: 15,
      vendorUserId: vendor1.id, sortOrder: 2,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p2m2.id, boqItemId: p2_b0i1.id, plannedQty: 0.4 } });
  await prisma.evidence.create({
    data: { milestoneId: p2m2.id, submittedById: vendor1.id, qtyOrPercent: 100, remarks: 'All piles driven and tested', frozen: true, status: EvidenceStatus.APPROVED, reviewedAt: daysAgo(52) },
  });
  await prisma.verification.create({
    data: { milestoneId: p2m2.id, verifiedById: pmc.id, qtyVerified: 0.4, valueEligibleComputed: 800000 },
  });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p2m2.id, boqValueCompleted: 800000, eligibleAmount: 800000,
      advanceAmount: 120000, remainingAmount: 680000, blockedAmount: 800000,
      state: EligibilityState.BLOCKED, dueDate: daysAgo(30),
      blockReasonCode: 'DISPUTE_PENDING', blockExplanation: 'Quantity dispute — awaiting third-party audit',
      blockedAt: daysAgo(48), blockedByActorId: owner.id,
    },
  });

  console.log('    ✓ Phase 0 — Piling & Foundation (2 milestones, BOQ APPROVED)');

  // ── Phase 1 — Superstructure (APPROVED BOQ, IN_PROGRESS) ─────────────────
  const p2_phase1 = await prisma.phase.create({
    data: { projectId: p2.id, name: 'Phase 1 — Concrete Superstructure', sortOrder: 1 },
  });

  const p2_boq1 = await prisma.bOQ.create({
    data: { projectId: p2.id, phaseId: p2_phase1.id, status: BOQStatus.APPROVED },
  });

  const [p2_b1i1] = await Promise.all([
    prisma.bOQItem.create({
      data: { boqId: p2_boq1.id, description: 'Concrete superstructure', unit: 'cum', plannedQty: 15000, rate: 180, plannedValue: 2700000 },
    }),
  ]);

  const p2m3 = await prisma.milestone.create({
    data: {
      projectId: p2.id, phaseId: p2_phase1.id,
      title: 'Concrete Superstructure — Tower A L1-10',
      description: 'Concrete pour for Tower A floors 1 through 10',
      paymentModel: PaymentModel.PROGRESS_BASED,
      plannedStart: daysAgo(30), plannedEnd: daysFromNow(60),
      baselinePlannedStart: daysAgo(30), baselinePlannedEnd: daysFromNow(55),
      actualStart: daysAgo(25),
      state: MilestoneState.IN_PROGRESS, value: 1350000, advancePercent: 10,
      vendorUserId: vendor1.id, sortOrder: 1,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p2m3.id, boqItemId: p2_b1i1.id, plannedQty: 7500 } });
  await prisma.milestoneStateTransition.createMany({
    data: [
      { milestoneId: p2m3.id, fromState: null, toState: 'DRAFT', actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(32) },
      { milestoneId: p2m3.id, fromState: 'DRAFT', toState: 'IN_PROGRESS', actorId: vendor1.id, role: Role.VENDOR, createdAt: daysAgo(25) },
    ],
  });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p2m3.id, advanceAmount: 135000, remainingAmount: 1215000,
      state: EligibilityState.NOT_DUE, dueDate: daysFromNow(60),
    },
  });

  console.log('    ✓ Phase 1 — Superstructure (1 milestone, BOQ APPROVED)');

  // ── Phase 2 — Finishing (REVISED BOQ — shows re-approval needed) ─────────
  const p2_phase2 = await prisma.phase.create({
    data: { projectId: p2.id, name: 'Phase 2 — Finishing Works', sortOrder: 2 },
  });

  const p2_boq2 = await prisma.bOQ.create({
    data: { projectId: p2.id, phaseId: p2_phase2.id, status: BOQStatus.REVISED },
  });

  await prisma.bOQItem.create({
    data: { boqId: p2_boq2.id, description: 'Interior fit-out both towers', unit: 'sqm', plannedQty: 20000, rate: 150, plannedValue: 3000000 },
  });

  await prisma.bOQRevision.create({
    data: {
      boqId: p2_boq2.id,
      revisionNumber: 1,
      reason: 'Client requested upgrade from standard to premium finish specification — rate increased from ₹120 to ₹150/sqm',
      changesJson: JSON.stringify({ before: { rate: 120, plannedValue: 2400000 }, after: { rate: 150, plannedValue: 3000000 } }),
    },
  });

  console.log('    ✓ Phase 2 — Finishing (BOQ REVISED — awaiting owner re-approval)');

  // ── P2 Dependencies ──────────────────────────────────────────────────────
  await prisma.milestoneDependency.createMany({
    data: [
      { predecessorId: p2m1.id, successorId: p2m2.id, dependencyType: 'FS', lagDays: 0 },
      { predecessorId: p2m2.id, successorId: p2m3.id, dependencyType: 'FS', lagDays: 3 },
    ],
  });

  console.log('  ✅ Project 2: Riverfront Residential Towers');
  console.log('     3 Phases | 3 BOQs (1 APPROVED, 1 APPROVED+BLOCKED, 1 REVISED) | 3 Milestones\n');
  await seedArchitectureForProject(p2.id, 'Riverfront');
  console.log('     + Architecture demo: sets, rows, versions, set request, audit logs\n');

  // ════════════════════════════════════════════════════════════════════════════
  // PROJECT 3 — Industrial Warehouse Fit-Out
  // 2 Phases: Demolition & Structure → Cold Storage & MEP
  // ════════════════════════════════════════════════════════════════════════════
  const p3 = await prisma.project.create({
    data: {
      name: 'Industrial Warehouse Fit-Out',
      description: 'Conversion of 50,000 sqft warehouse into modern logistics facility.',
      isExampleProject: true,
    },
  });

  await prisma.projectRole.createMany({
    data: [
      { projectId: p3.id, userId: owner.id, role: Role.OWNER },
      { projectId: p3.id, userId: pmc.id, role: Role.PMC },
      { projectId: p3.id, userId: vendor2.id, role: Role.VENDOR },
      { projectId: p3.id, userId: viewer.id, role: Role.VIEWER },
      { projectId: p3.id, userId: consultant.id, role: Role.CONSULTANT },
    ],
  });

  await prisma.projectScheduleConfig.create({
    data: {
      projectId: p3.id,
      projectStartDate: daysAgo(60),
      dailyOverheadCost: 2500,
      penaltyRatePerDay: 0.0015,
      opportunityCostFactor: 1.0,
    },
  });

  // ── Phase 0 — Demolition & Structure (APPROVED BOQ) ───────────────────────
  const p3_phase0 = await prisma.phase.create({
    data: { projectId: p3.id, name: 'Phase 0 — Demolition & Structure', sortOrder: 0 },
  });

  const p3_boq0 = await prisma.bOQ.create({
    data: { projectId: p3.id, phaseId: p3_phase0.id, status: BOQStatus.APPROVED },
  });

  const [p3_b0i1, p3_b0i2] = await Promise.all([
    prisma.bOQItem.create({
      data: { boqId: p3_boq0.id, description: 'Demolition and site prep', unit: 'LS', plannedQty: 1, rate: 50000, plannedValue: 50000 },
    }),
    prisma.bOQItem.create({
      data: { boqId: p3_boq0.id, description: 'Structural modifications and mezzanine', unit: 'LS', plannedQty: 1, rate: 150000, plannedValue: 150000 },
    }),
  ]);

  // Demolition (CLOSED)
  const p3m1 = await prisma.milestone.create({
    data: {
      projectId: p3.id, phaseId: p3_phase0.id,
      title: 'Demolition Complete',
      description: 'Remove existing fixtures and prepare site',
      paymentModel: PaymentModel.MILESTONE_COMPLETE,
      plannedStart: daysAgo(60), plannedEnd: daysAgo(50),
      baselinePlannedStart: daysAgo(60), baselinePlannedEnd: daysAgo(50),
      actualStart: daysAgo(58), actualSubmission: daysAgo(51), actualVerification: daysAgo(50),
      state: MilestoneState.CLOSED, value: 50000,
      vendorUserId: vendor2.id, sortOrder: 1,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p3m1.id, boqItemId: p3_b0i1.id, plannedQty: 1 } });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p3m1.id, boqValueCompleted: 50000, eligibleAmount: 50000,
      state: EligibilityState.MARKED_PAID, markedPaidAt: daysAgo(48), markedPaidByActorId: owner.id,
    },
  });

  // Structural Steel (VERIFIED)
  const p3m2 = await prisma.milestone.create({
    data: {
      projectId: p3.id, phaseId: p3_phase0.id,
      title: 'Structural Steel Install',
      description: 'Mezzanine reinforcement and structural steel',
      paymentModel: PaymentModel.PROGRESS_BASED,
      plannedStart: daysAgo(48), plannedEnd: daysAgo(35),
      baselinePlannedStart: daysAgo(48), baselinePlannedEnd: daysAgo(35),
      actualStart: daysAgo(47), actualSubmission: daysAgo(36), actualVerification: daysAgo(35),
      state: MilestoneState.VERIFIED, value: 75000, advancePercent: 20,
      vendorUserId: vendor2.id, sortOrder: 2,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p3m2.id, boqItemId: p3_b0i2.id, plannedQty: 0.5 } });
  await prisma.evidence.create({
    data: { milestoneId: p3m2.id, submittedById: vendor2.id, qtyOrPercent: 100, remarks: 'Mezzanine steel complete', frozen: true, status: EvidenceStatus.APPROVED, reviewedAt: daysAgo(36) },
  });
  await prisma.verification.create({
    data: { milestoneId: p3m2.id, verifiedById: pmc.id, qtyVerified: 0.5, valueEligibleComputed: 75000 },
  });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p3m2.id, boqValueCompleted: 75000, eligibleAmount: 75000,
      advanceAmount: 15000, remainingAmount: 60000,
      state: EligibilityState.FULLY_ELIGIBLE, dueDate: daysAgo(30),
    },
  });

  console.log('    ✓ Phase 0 — Demolition & Structure (2 milestones, BOQ APPROVED)');

  // ── Phase 1 — Cold Storage & MEP (APPROVED BOQ, IN_PROGRESS) ─────────────
  const p3_phase1 = await prisma.phase.create({
    data: { projectId: p3.id, name: 'Phase 1 — Cold Storage & MEP', sortOrder: 1 },
  });

  const p3_boq1 = await prisma.bOQ.create({
    data: { projectId: p3.id, phaseId: p3_phase1.id, status: BOQStatus.APPROVED },
  });

  const [p3_b1i1] = await Promise.all([
    prisma.bOQItem.create({
      data: { boqId: p3_boq1.id, description: 'Cold storage insulated panels', unit: 'sqm', plannedQty: 5000, rate: 100, plannedValue: 500000 },
    }),
  ]);

  const p3m3 = await prisma.milestone.create({
    data: {
      projectId: p3.id, phaseId: p3_phase1.id,
      title: 'Cold Storage — Insulation',
      description: 'Install insulated panels for cold storage rooms',
      paymentModel: PaymentModel.PROGRESS_BASED,
      plannedStart: daysAgo(15), plannedEnd: daysFromNow(15),
      baselinePlannedStart: daysAgo(15), baselinePlannedEnd: daysFromNow(15),
      actualStart: daysAgo(12),
      state: MilestoneState.IN_PROGRESS, value: 250000, advancePercent: 15,
      vendorUserId: vendor2.id, sortOrder: 1,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p3m3.id, boqItemId: p3_b1i1.id, plannedQty: 2500 } });
  await prisma.milestoneStateTransition.createMany({
    data: [
      { milestoneId: p3m3.id, fromState: null, toState: 'DRAFT', actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(18) },
      { milestoneId: p3m3.id, fromState: 'DRAFT', toState: 'IN_PROGRESS', actorId: vendor2.id, role: Role.VENDOR, createdAt: daysAgo(12) },
    ],
  });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p3m3.id, advanceAmount: 37500, remainingAmount: 212500,
      state: EligibilityState.NOT_DUE, dueDate: daysFromNow(15),
    },
  });

  console.log('    ✓ Phase 1 — Cold Storage & MEP (1 milestone, BOQ APPROVED)');

  // P3 Dependencies
  await prisma.milestoneDependency.createMany({
    data: [
      { predecessorId: p3m1.id, successorId: p3m2.id, dependencyType: 'FS', lagDays: 0 },
      { predecessorId: p3m2.id, successorId: p3m3.id, dependencyType: 'FS', lagDays: 3 },
    ],
  });

  console.log('  ✅ Project 3: Industrial Warehouse Fit-Out');
  console.log('     2 Phases | 2 BOQs (both APPROVED) | 3 Milestones\n');
  await seedArchitectureForProject(p3.id, 'Warehouse');
  console.log('     + Architecture demo: sets, rows, versions, set request, audit logs\n');

  // ── Project Communications ────────────────────────────────────────────────
  console.log('  Seeding project communications…');
  await Promise.all([
    // P1: Vendor RFI — RESOLVED
    prisma.vendorRequest.create({
      data: {
        projectId: p1.id, submittedById: vendor1.id, senderRole: 'VENDOR',
        category: 'REQUEST', type: 'RFI', priority: 'HIGH',
        title: 'Clarification on concrete grade for columns',
        description: 'The BOQ specifies M30 grade concrete for columns, but the drawing notes indicate M25. Please clarify which grade to use for the structural columns on floors 1-5.',
        sendTo: 'PMC', status: 'RESOLVED',
        dueDate: daysAgo(5),
        responseNote: 'Use M30 grade as specified in the BOQ. The drawing note was an error from an earlier revision.',
        respondedById: pmc.id, respondedAt: daysAgo(4),
        createdAt: daysAgo(8), updatedAt: daysAgo(4),
      },
    }),
    // P1: Vendor Material Approval — ACKNOWLEDGED
    prisma.vendorRequest.create({
      data: {
        projectId: p1.id, submittedById: vendor1.id, senderRole: 'VENDOR',
        category: 'REQUEST', type: 'MATERIAL_APPROVAL', priority: 'URGENT',
        title: 'Material Approval — Rebar supplier change',
        description: 'Our original rebar supplier (TISCO) is facing delivery delays. We request approval to switch to JSW Steel for the remaining quantities. JSW Steel meets IS:1786 Fe-500D specification.',
        sendTo: 'PMC', status: 'ACKNOWLEDGED',
        dueDate: daysFromNow(3),
        responseNote: 'Acknowledged. We are reviewing the JSW Steel specifications. Will respond within 48 hours.',
        respondedById: pmc.id, respondedAt: daysAgo(1),
        createdAt: daysAgo(2), updatedAt: daysAgo(1),
      },
    }),
    // P1: Vendor site access — PENDING
    prisma.vendorRequest.create({
      data: {
        projectId: p1.id, submittedById: vendor2.id, senderRole: 'VENDOR',
        category: 'REQUEST', type: 'SITE_INSTRUCTION', priority: 'HIGH',
        title: 'Site access for Sunday — MEP pre-installation',
        description: 'We need site access on Sunday from 7am to 5pm for MEP conduit pre-installation on floors 3 and 4. This is needed before the slab cast on Monday.',
        sendTo: 'BOTH', status: 'PENDING',
        dueDate: daysFromNow(2),
        createdAt: daysAgo(1), updatedAt: daysAgo(1),
      },
    }),
    // P1: Vendor invoice — PENDING
    prisma.vendorRequest.create({
      data: {
        projectId: p1.id, submittedById: vendor1.id, senderRole: 'VENDOR',
        category: 'SUBMISSION', type: 'INVOICE', priority: 'NORMAL',
        title: 'Invoice #INV-2024-047 — Steel Framework L1-5',
        description: 'Submitting invoice for completed structural steel framework floors 1-5. Milestone verified by PMC. Amount: ₹2,50,000 as per BOQ rate.',
        sendTo: 'OWNER', status: 'PENDING',
        dueDate: daysFromNow(15),
        createdAt: daysAgo(3), updatedAt: daysAgo(3),
      },
    }),
    // P1: PMC work order to vendor — ACKNOWLEDGED
    prisma.vendorRequest.create({
      data: {
        projectId: p1.id, submittedById: pmc.id, senderRole: 'PMC',
        category: 'REQUEST', type: 'WORK_ORDER', priority: 'HIGH',
        title: 'Work Order — MEP rough-in floors 6-10',
        description: 'Following BOQ approval, issue formal work order for MEP rough-in on floors 6-10. Please mobilize within 5 working days.',
        sendTo: 'VENDOR', status: 'ACKNOWLEDGED',
        dueDate: daysFromNow(45),
        responseNote: 'Received and acknowledged. Will mobilize team by Monday.',
        respondedById: vendor1.id, respondedAt: daysAgo(1),
        createdAt: daysAgo(3), updatedAt: daysAgo(1),
      },
    }),
    // P1: PMC snag list — PENDING
    prisma.vendorRequest.create({
      data: {
        projectId: p1.id, submittedById: pmc.id, senderRole: 'PMC',
        category: 'SUBMISSION', type: 'INSPECTION_REPORT', priority: 'HIGH',
        title: 'Snag List — Floor Slab L1-3 inspection',
        description: 'Attached is the snag list from the L1-3 slab inspection. Items requiring rectification before final payment: (1) Cold joint at grid C4; (2) Cover block missing at column B2; (3) Curing compound not applied to east wing.',
        sendTo: 'VENDOR', status: 'PENDING',
        dueDate: daysFromNow(7),
        createdAt: daysAgo(2), updatedAt: daysAgo(2),
      },
    }),
    // P1: PMC design query to Consultant — IN_REVIEW
    prisma.vendorRequest.create({
      data: {
        projectId: p1.id, submittedById: pmc.id, senderRole: 'PMC',
        category: 'REQUEST', type: 'DESIGN_QUERY', priority: 'NORMAL',
        title: 'Design Query — Column splice detail at level 5',
        description: 'The structural drawing SD-014 shows a column splice at level 5 but does not give adequate detail for the bolted connection. Contractor is requesting this clarification before fabrication.',
        sendTo: 'CONSULTANT', status: 'IN_REVIEW',
        dueDate: daysFromNow(5),
        responseNote: 'Noted. Preparing detailed splice connection drawing. Will issue by end of week.',
        respondedById: consultant.id, respondedAt: daysAgo(1),
        createdAt: daysAgo(4), updatedAt: daysAgo(1),
      },
    }),
    // P1: Consultant design clarification to vendor — PENDING
    prisma.vendorRequest.create({
      data: {
        projectId: p1.id, submittedById: consultant.id, senderRole: 'CONSULTANT',
        category: 'REQUEST', type: 'DESIGN_CLARIFICATION', priority: 'NORMAL',
        title: 'Design Clarification — Facade anchor bracket spacing',
        description: 'The installed facade brackets on the south elevation do not match the approved bracket spacing of 900mm c/c. Site measurements show 1100mm c/c in some locations.',
        sendTo: 'VENDOR', status: 'PENDING',
        dueDate: daysFromNow(4),
        createdAt: daysAgo(1), updatedAt: daysAgo(1),
      },
    }),
    // P2: Consultant drawing issue — RESOLVED
    prisma.vendorRequest.create({
      data: {
        projectId: p2.id, submittedById: consultant.id, senderRole: 'CONSULTANT',
        category: 'SUBMISSION', type: 'DRAWING_ISSUE', priority: 'HIGH',
        title: 'Drawing Issue — Updated pile cap PCA-002 Rev C',
        description: 'Issuing updated pile cap drawing PCA-002 Rev C incorporating the modified reinforcement for the rock founding condition encountered at RL -2.0m. This supersedes Rev B.',
        sendTo: 'VENDOR', status: 'RESOLVED',
        dueDate: daysAgo(5),
        responseNote: 'Drawing received. Rev C has been distributed to site team. Construction proceeding per Rev C.',
        respondedById: vendor1.id, respondedAt: daysAgo(8),
        createdAt: daysAgo(10), updatedAt: daysAgo(8),
      },
    }),
    // P2: Vendor variation — IN_REVIEW
    prisma.vendorRequest.create({
      data: {
        projectId: p2.id, submittedById: vendor1.id, senderRole: 'VENDOR',
        category: 'REQUEST', type: 'VARIATION', priority: 'HIGH',
        title: 'Variation Order — Rock excavation below RL -2.0m',
        description: 'We encountered rock strata below RL -2.0m which was not in the original scope. Requesting a variation order for rock breaking and removal at an additional rate of ₹4,500/cum for approx. 320 cum.',
        sendTo: 'PMC', status: 'IN_REVIEW',
        dueDate: daysFromNow(10),
        responseNote: 'Variation reviewed and passed to owner for approval. Quantities to be verified on site.',
        respondedById: pmc.id, respondedAt: daysAgo(2),
        createdAt: daysAgo(5), updatedAt: daysAgo(2),
      },
    }),
    // P3: PMC site instruction — PENDING
    prisma.vendorRequest.create({
      data: {
        projectId: p3.id, submittedById: pmc.id, senderRole: 'PMC',
        category: 'REQUEST', type: 'SITE_INSTRUCTION', priority: 'NORMAL',
        title: 'Site Instruction — Cold room door openings',
        description: 'Per client request, the cold room door openings must be increased from 1200mm to 1500mm width to accommodate the new forklift model. Please revise the panel layout accordingly.',
        sendTo: 'VENDOR', status: 'PENDING',
        dueDate: daysFromNow(5),
        createdAt: daysAgo(1), updatedAt: daysAgo(1),
      },
    }),
  ]);

  console.log('  ✅ Project communications seeded (11 requests across 3 projects)\n');

  // ══════════════════════════════════════════════════════════════════════════════
  // PROJECT 4 — Gateway Commercial Tower (Full demo: all charts + all states)
  // 30-story mixed-use tower, 18-month build, currently in superstructure phase.
  // Designed to populate every analytics chart for demonstration purposes.
  // ══════════════════════════════════════════════════════════════════════════════
  console.log('  Seeding Project 4: Gateway Commercial Tower (full analytics demo)…');

  const p4 = await prisma.project.create({
    data: {
      name: 'Gateway Commercial Tower',
      description: '30-storey mixed-use commercial tower. Concrete frame, curtain wall facade, full MEP fit-out. Contract value AED 94,000,000.',
      isExampleProject: true,
      metadata: JSON.stringify({
        location: 'Business Bay, Dubai, UAE',
        contractValue: 94_000_000,
        currency: 'AED',
        startDate: new Date(now.getTime() - 420 * 86_400_000).toISOString(),
        endDate: new Date(now.getTime() + 355 * 86_400_000).toISOString(),
      }),
    },
  });

  await prisma.projectRole.createMany({
    data: [
      { projectId: p4.id, userId: admin.id,      role: Role.OWNER },
      { projectId: p4.id, userId: owner.id,       role: Role.OWNER },
      { projectId: p4.id, userId: pmc.id,         role: Role.PMC },
      { projectId: p4.id, userId: vendor1.id,     role: Role.VENDOR },
      { projectId: p4.id, userId: vendor2.id,     role: Role.VENDOR },
      { projectId: p4.id, userId: viewer.id,      role: Role.VIEWER },
      { projectId: p4.id, userId: consultant.id,  role: Role.CONSULTANT },
    ],
  });

  await prisma.projectScheduleConfig.create({
    data: {
      projectId: p4.id,
      projectStartDate: daysAgo(420),
      dailyOverheadCost: 18_000,
      penaltyRatePerDay: 0.0008,
      opportunityCostFactor: 1.3,
    },
  });

  // ── BOQ helper — one BOQ per phase, returns items by index ──────────────
  async function p4BOQ(phaseId: string, items: { desc: string; unit: string; qty: number; rate: number }[]) {
    const boq = await prisma.bOQ.create({ data: { projectId: p4.id, phaseId, status: BOQStatus.APPROVED } });
    const created = await Promise.all(items.map(i =>
      prisma.bOQItem.create({ data: { boqId: boq.id, description: i.desc, unit: i.unit, plannedQty: i.qty, rate: i.rate, plannedValue: i.qty * i.rate } })
    ));
    return created; // array of items in same order as input
  }

  // ── Milestone helper (reduces repetition) ────────────────────────────────
  async function p4Closed(
    phaseId: string, boqItemId: string, sortOrder: number,
    title: string, desc: string, boqQty: number,
    ps: Date, pe: Date, as_: Date, asub: Date, aver: Date,
    val: number, vendorId: string,
    approvalCycleDays: number, // evidence→verification gap
  ) {
    const m = await prisma.milestone.create({ data: {
      projectId: p4.id, phaseId,
      title, description: desc,
      paymentModel: PaymentModel.MILESTONE_COMPLETE,
      plannedStart: ps, plannedEnd: pe,
      baselinePlannedStart: ps, baselinePlannedEnd: pe,
      actualStart: as_, actualSubmission: asub, actualVerification: aver,
      state: MilestoneState.CLOSED, value: val,
      vendorUserId: vendorId, sortOrder,
    }});
    await prisma.milestoneBOQLink.create({ data: { milestoneId: m.id, boqItemId, plannedQty: boqQty } });
    await prisma.milestoneStateTransition.createMany({ data: [
      { milestoneId: m.id, fromState: null,          toState: 'DRAFT',       actorId: pmc.id,     role: Role.PMC,    createdAt: new Date(ps.getTime() - 3*86_400_000) },
      { milestoneId: m.id, fromState: 'DRAFT',       toState: 'IN_PROGRESS', actorId: vendorId,   role: Role.VENDOR, createdAt: as_ },
      { milestoneId: m.id, fromState: 'IN_PROGRESS', toState: 'SUBMITTED',   actorId: vendorId,   role: Role.VENDOR, createdAt: asub },
      { milestoneId: m.id, fromState: 'SUBMITTED',   toState: 'VERIFIED',    actorId: pmc.id,     role: Role.PMC,    createdAt: new Date(asub.getTime() + approvalCycleDays * 86_400_000) },
      { milestoneId: m.id, fromState: 'VERIFIED',    toState: 'CLOSED',      actorId: owner.id,   role: Role.OWNER,  createdAt: aver },
    ]});
    await prisma.evidence.create({ data: {
      milestoneId: m.id, submittedById: vendorId,
      qtyOrPercent: 100, remarks: `${title} — work completed and verified on site.`,
      frozen: true, status: EvidenceStatus.APPROVED,
      reviewedAt: new Date(asub.getTime() + approvalCycleDays * 86_400_000),
    }});
    const verifiedAt = new Date(asub.getTime() + approvalCycleDays * 86_400_000);
    await prisma.verification.create({ data: { milestoneId: m.id, verifiedById: pmc.id, qtyVerified: boqQty, valueEligibleComputed: val, verifiedAt } });
    await prisma.paymentEligibility.create({ data: {
      milestoneId: m.id, boqValueCompleted: val, eligibleAmount: val,
      advanceAmount: 0, remainingAmount: 0,
      state: EligibilityState.MARKED_PAID, dueDate: aver,
      markedPaidAt: new Date(aver.getTime() + 7 * 86_400_000),
      markedPaidByActorId: owner.id,
      paidExplanation: 'Bank transfer — invoice settled.',
    }});
    return m;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 0 — Enabling Works (DONE, daysAgo(420) → daysAgo(365))
  // ─────────────────────────────────────────────────────────────────────────
  const p4ph0 = await prisma.phase.create({ data: { projectId: p4.id, name: 'Phase 0 — Enabling Works', sortOrder: 0 } });
  const [p4b0i] = await p4BOQ(p4ph0.id, [{ desc: 'Site clearance, hoarding & temp utilities', unit: 'LS', qty: 1, rate: 430_000 }]);

  const p4m1 = await p4Closed(p4ph0.id, p4b0i.id, 1, 'Site Clearance & Hoarding',
    'Install perimeter hoarding, clear site, establish site offices and compound.',
    0.5, daysAgo(420), daysAgo(405), daysAgo(418), daysAgo(408), daysAgo(405), 215_000, vendor1.id, 3);
  const p4m2 = await p4Closed(p4ph0.id, p4b0i.id, 2, 'Temporary Utilities & Access Roads',
    'Establish temporary power, water, sewage, and haul roads within site.',
    0.5, daysAgo(404), daysAgo(390), daysAgo(402), daysAgo(391), daysAgo(388), 215_000, vendor1.id, 2);

  console.log('    ✓ Phase 0 — Enabling Works (2 CLOSED)');

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 1 — Substructure (DONE, daysAgo(390) → daysAgo(230))
  // ─────────────────────────────────────────────────────────────────────────
  const p4ph1 = await prisma.phase.create({ data: { projectId: p4.id, name: 'Phase 1 — Substructure & Foundation', sortOrder: 1 } });
  const [p4b1i1, p4b1i2, p4b1i3, p4b1i4] = await p4BOQ(p4ph1.id, [
    { desc: 'Piling works — 320 bored piles dia 900mm', unit: 'No.', qty: 320, rate: 12_000 },
    { desc: 'Pile caps, grade beams & raft foundation', unit: 'cum', qty: 4800, rate: 620 },
    { desc: 'Basement retaining walls B2-B1',           unit: 'sqm', qty: 3200, rate: 480 },
    { desc: 'Raft waterproofing & drainage',            unit: 'sqm', qty: 5600, rate: 180 },
  ]);

  const p4m3 = await p4Closed(p4ph1.id, p4b1i1.id, 1, 'Piling Works — 320 Bored Piles',
    'Bore and cast 320 reinforced concrete piles dia 900mm to depths 28-35m.',
    320, daysAgo(388), daysAgo(340), daysAgo(385), daysAgo(342), daysAgo(339), 3_840_000, vendor1.id, 5);
  const p4m4 = await p4Closed(p4ph1.id, p4b1i2.id, 2, 'Pile Caps, Grade Beams & Raft Foundation',
    'Excavate and cast pile caps, grade beams and 800mm thick raft slab.',
    4800, daysAgo(338), daysAgo(298), daysAgo(336), daysAgo(299), daysAgo(296), 2_976_000, vendor1.id, 4);
  const p4m5 = await p4Closed(p4ph1.id, p4b1i3.id, 3, 'Basement Retaining Walls (B2 & B1)',
    'Cast insitu RC retaining walls for 2-level basement carpark.',
    3200, daysAgo(296), daysAgo(258), daysAgo(294), daysAgo(260), daysAgo(257), 1_536_000, vendor1.id, 3);
  const p4m6 = await p4Closed(p4ph1.id, p4b1i4.id, 4, 'Raft Waterproofing & Drainage Layer',
    'Apply torch-on waterproofing membrane to raft slab and install drainage composite.',
    5600, daysAgo(256), daysAgo(232), daysAgo(254), daysAgo(233), daysAgo(230), 1_008_000, vendor2.id, 2);

  console.log('    ✓ Phase 1 — Substructure (4 CLOSED)');

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 2 — Superstructure (MIXED: 6 CLOSED + 1 VERIFIED + 1 IN_PROGRESS + 1 SUBMITTED + 1 DRAFT)
  // ─────────────────────────────────────────────────────────────────────────
  const p4ph2 = await prisma.phase.create({ data: { projectId: p4.id, name: 'Phase 2 — Superstructure', sortOrder: 2 } });
  const [p4b2i] = await p4BOQ(p4ph2.id, [{ desc: 'RC frame — core walls, columns, flat slabs', unit: 'cum', qty: 28_000, rate: 580 }]);

  const p4m7  = await p4Closed(p4ph2.id, p4b2i.id, 1, 'Core Walls — Basement to Ground Level',
    'Cast RC shear core walls from B2 to GL with staircase and lift shafts.',
    2800, daysAgo(230), daysAgo(192), daysAgo(228), daysAgo(193), daysAgo(190), 1_624_000, vendor1.id, 4);
  const p4m8  = await p4Closed(p4ph2.id, p4b2i.id, 2, 'Podium Slabs — Levels B1 to L3',
    'Cast post-tensioned flat slabs for basement and podium levels.',
    4200, daysAgo(192), daysAgo(155), daysAgo(190), daysAgo(160), daysAgo(157), 2_436_000, vendor1.id, 6); // 6-day approval = delay
  const p4m9  = await p4Closed(p4ph2.id, p4b2i.id, 3, 'Tower Frame — Floors L4 to L10',
    'Columns, shear walls and flat slabs floors 4 through 10.',
    4900, daysAgo(155), daysAgo(110), daysAgo(153), daysAgo(111), daysAgo(108), 2_842_000, vendor1.id, 3);
  const p4m10 = await p4Closed(p4ph2.id, p4b2i.id, 4, 'Tower Frame — Floors L11 to L17',
    'Columns, shear walls and flat slabs floors 11 through 17.',
    4900, daysAgo(110), daysAgo(70),  daysAgo(108), daysAgo(71),  daysAgo(68),  2_842_000, vendor1.id, 4);

  // M11: L18-L23 — VERIFIED (payment due, not yet closed)
  const p4m11 = await prisma.milestone.create({ data: {
    projectId: p4.id, phaseId: p4ph2.id,
    title: 'Tower Frame — Floors L18 to L23',
    description: 'Columns, shear walls and flat slabs floors 18 through 23.',
    paymentModel: PaymentModel.MILESTONE_COMPLETE,
    plannedStart: daysAgo(70), plannedEnd: daysAgo(30),
    baselinePlannedStart: daysAgo(70), baselinePlannedEnd: daysAgo(32),
    actualStart: daysAgo(68), actualSubmission: daysAgo(31), actualVerification: daysAgo(22),
    state: MilestoneState.VERIFIED, value: 2_842_000,
    vendorUserId: vendor1.id, sortOrder: 5,
  }});
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p4m11.id, boqItemId: p4b2i.id, plannedQty: 4900 } });
  await prisma.milestoneStateTransition.createMany({ data: [
    { milestoneId: p4m11.id, fromState: null, toState: 'DRAFT', actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(73) },
    { milestoneId: p4m11.id, fromState: 'DRAFT', toState: 'IN_PROGRESS', actorId: vendor1.id, role: Role.VENDOR, createdAt: daysAgo(68) },
    { milestoneId: p4m11.id, fromState: 'IN_PROGRESS', toState: 'SUBMITTED', actorId: vendor1.id, role: Role.VENDOR, createdAt: daysAgo(31) },
    { milestoneId: p4m11.id, fromState: 'SUBMITTED', toState: 'VERIFIED', actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(22) },
  ]});
  await prisma.evidence.create({ data: { milestoneId: p4m11.id, submittedById: vendor1.id, qtyOrPercent: 100, remarks: 'Floors L18-L23 complete. All slabs poured, columns stripped and surveyed.', frozen: true, status: EvidenceStatus.APPROVED, reviewedAt: daysAgo(26) }});
  await prisma.verification.create({ data: { milestoneId: p4m11.id, verifiedById: pmc.id, qtyVerified: 4900, valueEligibleComputed: 2_842_000, verifiedAt: daysAgo(22) }});
  await prisma.paymentEligibility.create({ data: { milestoneId: p4m11.id, boqValueCompleted: 2_842_000, eligibleAmount: 2_842_000, state: EligibilityState.FULLY_ELIGIBLE, dueDate: daysAgo(20) }});

  // M12: L24-L28 — IN_PROGRESS (currently behind schedule — key escalation source)
  const p4m12 = await prisma.milestone.create({ data: {
    projectId: p4.id, phaseId: p4ph2.id,
    title: 'Tower Frame — Floors L24 to L28',
    description: 'Columns, shear walls and flat slabs floors 24 through 28. Critical path item.',
    paymentModel: PaymentModel.MILESTONE_COMPLETE,
    plannedStart: daysAgo(32), plannedEnd: daysFromNow(12),
    baselinePlannedStart: daysAgo(32), baselinePlannedEnd: daysFromNow(10),
    actualStart: daysAgo(24), // started 8 days late
    state: MilestoneState.IN_PROGRESS, value: 2_320_000,
    vendorUserId: vendor1.id, sortOrder: 6,
  }});
  await prisma.milestoneStateTransition.createMany({ data: [
    { milestoneId: p4m12.id, fromState: null, toState: 'DRAFT', actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(35) },
    { milestoneId: p4m12.id, fromState: 'DRAFT', toState: 'IN_PROGRESS', actorId: vendor1.id, role: Role.VENDOR, createdAt: daysAgo(24) },
  ]});

  // M13: L29-L30 & Roof — SUBMITTED (evidence under review)
  const p4m13 = await prisma.milestone.create({ data: {
    projectId: p4.id, phaseId: p4ph2.id,
    title: 'Tower Frame — L29, L30 & Roof Slab',
    description: 'Top two floors, roof slab, lift overrun and plant room.',
    paymentModel: PaymentModel.MILESTONE_COMPLETE,
    plannedStart: daysFromNow(10), plannedEnd: daysFromNow(55),
    baselinePlannedStart: daysFromNow(10), baselinePlannedEnd: daysFromNow(55),
    state: MilestoneState.DRAFT, value: 2_030_000,
    vendorUserId: vendor1.id, sortOrder: 7,
  }});

  console.log('    ✓ Phase 2 — Superstructure (4 CLOSED + 1 VERIFIED + 1 IN_PROGRESS + 1 DRAFT)');

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 3 — External Envelope (DRAFT — all future)
  // ─────────────────────────────────────────────────────────────────────────
  const p4ph3 = await prisma.phase.create({ data: { projectId: p4.id, name: 'Phase 3 — External Envelope', sortOrder: 3 } });
  const [p4b3i1, p4b3i2] = await p4BOQ(p4ph3.id, [
    { desc: 'Unitised curtain wall system — supply & install', unit: 'sqm', qty: 18_500, rate: 480 },
    { desc: 'Roof waterproofing, insulation & finishes',       unit: 'sqm', qty: 3200,  rate: 320 },
  ]);

  const p4m14 = await prisma.milestone.create({ data: {
    projectId: p4.id, phaseId: p4ph3.id,
    title: 'Curtain Wall Frame & Anchors — Podium',
    description: 'Install unitised curtain wall system and glazing — podium levels L1-L3.',
    paymentModel: PaymentModel.PROGRESS_BASED,
    plannedStart: daysFromNow(50), plannedEnd: daysFromNow(95),
    baselinePlannedStart: daysFromNow(50), baselinePlannedEnd: daysFromNow(95),
    state: MilestoneState.DRAFT, value: 3_552_000,
    vendorUserId: vendor2.id, sortOrder: 1,
  }});
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p4m14.id, boqItemId: p4b3i1.id, plannedQty: 7400 } });

  const p4m15 = await prisma.milestone.create({ data: {
    projectId: p4.id, phaseId: p4ph3.id,
    title: 'Curtain Wall — Tower L4 to L30',
    description: 'Full tower curtain wall — 11,100 sqm unitised panels including spandrels.',
    paymentModel: PaymentModel.PROGRESS_BASED,
    plannedStart: daysFromNow(90), plannedEnd: daysFromNow(155),
    baselinePlannedStart: daysFromNow(90), baselinePlannedEnd: daysFromNow(155),
    state: MilestoneState.DRAFT, value: 5_328_000,
    vendorUserId: vendor2.id, sortOrder: 2,
  }});
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p4m15.id, boqItemId: p4b3i1.id, plannedQty: 11100 } });

  const p4m16 = await prisma.milestone.create({ data: {
    projectId: p4.id, phaseId: p4ph3.id,
    title: 'Roof Waterproofing & Insulation',
    description: 'Torch-on waterproofing, rigid PIR insulation and paving to roof terrace.',
    paymentModel: PaymentModel.MILESTONE_COMPLETE,
    plannedStart: daysFromNow(150), plannedEnd: daysFromNow(175),
    baselinePlannedStart: daysFromNow(150), baselinePlannedEnd: daysFromNow(175),
    state: MilestoneState.DRAFT, value: 1_024_000,
    vendorUserId: vendor2.id, sortOrder: 3,
  }});
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p4m16.id, boqItemId: p4b3i2.id, plannedQty: 3200 } });

  console.log('    ✓ Phase 3 — External Envelope (3 DRAFT)');

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 4 — MEP & Services (DRAFT)
  // ─────────────────────────────────────────────────────────────────────────
  const p4ph4 = await prisma.phase.create({ data: { projectId: p4.id, name: 'Phase 4 — MEP & Services', sortOrder: 4 } });
  const [p4b4i] = await p4BOQ(p4ph4.id, [{ desc: 'MEP complete package — HVAC, Electrical, Plumbing, Fire', unit: 'LS', qty: 1, rate: 18_400_000 }]);

  const p4m17 = await prisma.milestone.create({ data: {
    projectId: p4.id, phaseId: p4ph4.id,
    title: 'MEP Rough-In — Basement & Podium',
    description: 'All MEP first-fix: conduits, ductwork, piping — basement and podium levels.',
    paymentModel: PaymentModel.PROGRESS_BASED,
    plannedStart: daysFromNow(88), plannedEnd: daysFromNow(138),
    baselinePlannedStart: daysFromNow(88), baselinePlannedEnd: daysFromNow(138),
    state: MilestoneState.DRAFT, value: 4_600_000,
    vendorUserId: vendor2.id, sortOrder: 1,
  }});
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p4m17.id, boqItemId: p4b4i.id, plannedQty: 0.25 } });

  const p4m18 = await prisma.milestone.create({ data: {
    projectId: p4.id, phaseId: p4ph4.id,
    title: 'MEP Rough-In — Tower L4 to L20',
    description: 'All MEP first-fix: conduits, ductwork, piping — tower floors 4-20.',
    paymentModel: PaymentModel.PROGRESS_BASED,
    plannedStart: daysFromNow(135), plannedEnd: daysFromNow(185),
    baselinePlannedStart: daysFromNow(135), baselinePlannedEnd: daysFromNow(185),
    state: MilestoneState.DRAFT, value: 5_060_000,
    vendorUserId: vendor2.id, sortOrder: 2,
  }});
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p4m18.id, boqItemId: p4b4i.id, plannedQty: 0.275 } });

  const p4m19 = await prisma.milestone.create({ data: {
    projectId: p4.id, phaseId: p4ph4.id,
    title: 'MEP Rough-In — Tower L21 to L30',
    description: 'All MEP first-fix: conduits, ductwork, piping — tower floors 21-30.',
    paymentModel: PaymentModel.PROGRESS_BASED,
    plannedStart: daysFromNow(183), plannedEnd: daysFromNow(220),
    baselinePlannedStart: daysFromNow(183), baselinePlannedEnd: daysFromNow(220),
    state: MilestoneState.DRAFT, value: 3_680_000,
    vendorUserId: vendor2.id, sortOrder: 3,
  }});
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p4m19.id, boqItemId: p4b4i.id, plannedQty: 0.2 } });

  const p4m20 = await prisma.milestone.create({ data: {
    projectId: p4.id, phaseId: p4ph4.id,
    title: 'HVAC Plant, Chillers & AHUs',
    description: 'Supply, install and commission chiller plant, air-handling units and BMS.',
    paymentModel: PaymentModel.MILESTONE_COMPLETE,
    plannedStart: daysFromNow(215), plannedEnd: daysFromNow(255),
    baselinePlannedStart: daysFromNow(215), baselinePlannedEnd: daysFromNow(255),
    state: MilestoneState.DRAFT, value: 5_060_000,
    vendorUserId: vendor2.id, sortOrder: 4,
  }});
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p4m20.id, boqItemId: p4b4i.id, plannedQty: 0.275 } });

  console.log('    ✓ Phase 4 — MEP & Services (4 DRAFT)');

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 5 — Finishing & Handover (DRAFT)
  // ─────────────────────────────────────────────────────────────────────────
  const p4ph5 = await prisma.phase.create({ data: { projectId: p4.id, name: 'Phase 5 — Finishing & Handover', sortOrder: 5 } });
  const [p4b5i] = await p4BOQ(p4ph5.id, [{ desc: 'Internal fit-out, finishes, FF&E and landscaping', unit: 'LS', qty: 1, rate: 22_500_000 }]);

  const p4m21 = await prisma.milestone.create({ data: {
    projectId: p4.id, phaseId: p4ph5.id,
    title: 'Internal Fit-Out — Ground & Podium',
    description: 'Full fit-out of ground floor lobby, retail podium, common areas and car park.',
    paymentModel: PaymentModel.PROGRESS_BASED,
    plannedStart: daysFromNow(250), plannedEnd: daysFromNow(295),
    baselinePlannedStart: daysFromNow(250), baselinePlannedEnd: daysFromNow(295),
    state: MilestoneState.DRAFT, value: 6_750_000,
    vendorUserId: vendor2.id, sortOrder: 1,
  }});
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p4m21.id, boqItemId: p4b5i.id, plannedQty: 0.3 } });

  const p4m22 = await prisma.milestone.create({ data: {
    projectId: p4.id, phaseId: p4ph5.id,
    title: 'Internal Fit-Out — Tower Floors',
    description: 'Office fit-out floors 4-30: raised floors, ceilings, partitions, finishes.',
    paymentModel: PaymentModel.PROGRESS_BASED,
    plannedStart: daysFromNow(290), plannedEnd: daysFromNow(335),
    baselinePlannedStart: daysFromNow(290), baselinePlannedEnd: daysFromNow(335),
    state: MilestoneState.DRAFT, value: 11_250_000,
    vendorUserId: vendor2.id, sortOrder: 2,
  }});
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p4m22.id, boqItemId: p4b5i.id, plannedQty: 0.5 } });

  const p4m23 = await prisma.milestone.create({ data: {
    projectId: p4.id, phaseId: p4ph5.id,
    title: 'Commissioning, Testing & Balancing',
    description: 'Full systems commissioning, TAB, lifts witness testing, fire drill.',
    paymentModel: PaymentModel.MILESTONE_COMPLETE,
    plannedStart: daysFromNow(332), plannedEnd: daysFromNow(348),
    baselinePlannedStart: daysFromNow(332), baselinePlannedEnd: daysFromNow(348),
    state: MilestoneState.DRAFT, value: 2_250_000,
    vendorUserId: vendor2.id, sortOrder: 3,
  }});
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p4m23.id, boqItemId: p4b5i.id, plannedQty: 0.1 } });

  const p4m24 = await prisma.milestone.create({ data: {
    projectId: p4.id, phaseId: p4ph5.id,
    title: 'Snagging, Defects Rectification & Handover',
    description: 'Complete snagging register, rectify defects and achieve Practical Completion.',
    paymentModel: PaymentModel.MILESTONE_COMPLETE,
    plannedStart: daysFromNow(346), plannedEnd: daysFromNow(355),
    baselinePlannedStart: daysFromNow(346), baselinePlannedEnd: daysFromNow(355),
    state: MilestoneState.DRAFT, value: 2_250_000,
    vendorUserId: vendor2.id, sortOrder: 4,
  }});
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p4m24.id, boqItemId: p4b5i.id, plannedQty: 0.1 } });

  console.log('    ✓ Phase 5 — Finishing & Handover (4 DRAFT)');

  // ─────────────────────────────────────────────────────────────────────────
  // DEPENDENCIES — full critical path chain
  // ─────────────────────────────────────────────────────────────────────────
  const p4deps = [
    { predecessorId: p4m1.id,  successorId: p4m2.id  },  // Hoarding → Utilities
    { predecessorId: p4m2.id,  successorId: p4m3.id  },  // Utilities → Piling
    { predecessorId: p4m3.id,  successorId: p4m4.id  },  // Piling → Pile caps
    { predecessorId: p4m4.id,  successorId: p4m5.id  },  // Caps → Retaining walls
    { predecessorId: p4m5.id,  successorId: p4m6.id  },  // Walls → Waterproofing
    { predecessorId: p4m6.id,  successorId: p4m7.id  },  // WP → Core walls
    { predecessorId: p4m7.id,  successorId: p4m8.id  },  // Cores → Podium slabs
    { predecessorId: p4m8.id,  successorId: p4m9.id  },  // Podium → L4-10
    { predecessorId: p4m9.id,  successorId: p4m10.id },  // L4-10 → L11-17
    { predecessorId: p4m10.id, successorId: p4m11.id },  // L11-17 → L18-23
    { predecessorId: p4m11.id, successorId: p4m12.id },  // L18-23 → L24-28
    { predecessorId: p4m12.id, successorId: p4m13.id },  // L24-28 → L29-30
    { predecessorId: p4m13.id, successorId: p4m14.id },  // Roof slab → Curtain wall podium
    { predecessorId: p4m14.id, successorId: p4m15.id },  // CW podium → CW tower
    { predecessorId: p4m15.id, successorId: p4m16.id },  // CW tower → Roof WP
    { predecessorId: p4m12.id, successorId: p4m17.id },  // L24-28 → MEP podium (parallel start)
    { predecessorId: p4m17.id, successorId: p4m18.id },  // MEP B/P → MEP L4-20
    { predecessorId: p4m18.id, successorId: p4m19.id },  // MEP L4-20 → MEP L21-30
    { predecessorId: p4m19.id, successorId: p4m20.id },  // MEP rough-in → HVAC plant
    { predecessorId: p4m15.id, successorId: p4m21.id },  // CW tower → Fit-out podium (can't clad until glazed)
    { predecessorId: p4m20.id, successorId: p4m21.id },  // HVAC → Fit-out (needs MEP done)
    { predecessorId: p4m21.id, successorId: p4m22.id },  // Podium fit-out → Tower fit-out
    { predecessorId: p4m22.id, successorId: p4m23.id },  // Tower fit-out → Commissioning
    { predecessorId: p4m23.id, successorId: p4m24.id },  // Commissioning → Handover
  ];
  for (const dep of p4deps) {
    await prisma.milestoneDependency.create({ data: { ...dep, dependencyType: 'FS', lagDays: 0 } });
  }
  console.log(`    ✓ ${p4deps.length} dependency edges wired`);

  // ─────────────────────────────────────────────────────────────────────────
  // ESCALATION TREND — FollowUp records over 12 weeks (populates trend chart)
  // ─────────────────────────────────────────────────────────────────────────
  const escalations = [
    // Week 12 ago — 1 escalation (piling delay concern)
    { targetEntityId: p4m3.id, createdAt: daysAgo(84), title: 'Piling pace behind target — risk to programme' },
    // Week 10 ago — 2 escalations
    { targetEntityId: p4m4.id, createdAt: daysAgo(71), title: 'Pile cap pour sequence causing rework — delay risk' },
    { targetEntityId: p4m4.id, createdAt: daysAgo(70), title: 'Concrete pump breakdown — L3 pour postponed' },
    // Week 8 ago — 1 escalation
    { targetEntityId: p4m5.id, createdAt: daysAgo(58), title: 'Retaining wall shutter failures — programme impact' },
    // Week 6 ago — 3 escalations (podium slabs delayed)
    { targetEntityId: p4m8.id, createdAt: daysAgo(44), title: 'PT slab tendon installation late — 4 day delay' },
    { targetEntityId: p4m8.id, createdAt: daysAgo(43), title: 'PMC verification overdue — podium slab payment blocked' },
    { targetEntityId: p4m8.id, createdAt: daysAgo(42), title: 'Grouting of PT anchors incomplete — HOLD on payment' },
    // Week 5 ago — 1 escalation
    { targetEntityId: p4m9.id, createdAt: daysAgo(37), title: 'Rebar delivery delay — 3-day pour window missed' },
    // Week 4 ago — 2 escalations
    { targetEntityId: p4m10.id, createdAt: daysAgo(30), title: 'Formwork stripping strength not achieved — dispute' },
    { targetEntityId: p4m10.id, createdAt: daysAgo(29), title: 'Survey shows column out of plumb >10mm — remedial required' },
    // Week 3 ago — 1 escalation
    { targetEntityId: p4m11.id, createdAt: daysAgo(22), title: 'L18-L23 verification delayed — PMC site access issue' },
    // Week 2 ago — 3 escalations (M12 started late)
    { targetEntityId: p4m12.id, createdAt: daysAgo(15), title: 'L24-28 start delayed 8 days — crane allocation conflict' },
    { targetEntityId: p4m12.id, createdAt: daysAgo(14), title: 'Concrete supply shortage — high-rise pump not available' },
    { targetEntityId: p4m12.id, createdAt: daysAgo(13), title: 'Completion of L24-28 may overrun planned end date' },
    // Week 1 ago — 2 escalations
    { targetEntityId: p4m12.id, createdAt: daysAgo(8), title: 'L24 slab pour cracked — investigation underway' },
    { targetEntityId: p4m12.id, createdAt: daysAgo(7), title: 'PMC raised NCR on column reinforcement spacing' },
    // Current week — 2 escalations
    { targetEntityId: p4m12.id, createdAt: daysAgo(3), title: 'Programme delay confirmed — 10 days behind on superstructure' },
    { targetEntityId: p4m12.id, createdAt: daysAgo(1), title: 'Client notified of revised substantial completion date' },
  ];
  for (const esc of escalations) {
    await prisma.followUp.create({ data: {
      projectId: p4.id,
      targetEntityId: esc.targetEntityId,
      targetEntity: 'Milestone',
      type: 'DELAY_RISK',
      status: 'ESCALATED',
      description: esc.title,
      createdAt: esc.createdAt,
    }});
  }
  console.log(`    ✓ ${escalations.length} escalation follow-ups seeded`);

  // ─────────────────────────────────────────────────────────────────────────
  // PAYMENT ELIGIBILITY EVENTS — so payment cycle chart has data
  // ─────────────────────────────────────────────────────────────────────────
  const eligibleMs = [p4m7, p4m8, p4m9, p4m10];
  for (const m of eligibleMs) {
    const pe = await prisma.paymentEligibility.findFirst({ where: { milestoneId: m.id } });
    if (pe) {
      await prisma.eligibilityEvent.create({ data: {
        paymentEligibilityId: pe.id,
        eventType: 'STATE_CHANGE',
        fromState: 'BLOCKED',
        toState: 'FULLY_ELIGIBLE',
        eligibleAmountAfter: pe.eligibleAmount,
        explanation: 'Milestone verified and evidence approved',
        actorId: pmc.id,
        actorRole: Role.PMC,
      }});
    }
  }

  console.log('  ✅ Project 4: Gateway Commercial Tower');
  console.log(`     6 Phases | 24 Milestones | ${p4deps.length} Dependencies | ${escalations.length} Escalations\n`);

  console.log('  ✅ Project communications seeded (11 requests across 3 projects)\n');

  console.log('🎉 Seed complete!\n');
  console.log('  Projects    : 4 (Downtown Office | Riverfront Towers | Warehouse Fit-Out | Gateway Tower)');
  console.log('  Users       : 7 (admin + owner + pmc + 2 vendors + viewer + consultant)');
  console.log('  Phases      : 15 total (4 + 3 + 2 + 6)');
  console.log('  BOQs        : 22 total');
  console.log('  Milestones  : 38 total (14 + 3 + 3 + 24 across 4 projects)');
  console.log('  Dependencies: 34 edges total');
  console.log('  Escalations : 18 follow-ups across 12 weeks — trend chart ready');
  console.log('\n  Demo logins (password: password123)');
  console.log('    Client     :  client@example.com');
  console.log('    PMC        :  pmc@example.com');
  console.log('    Vendor 1   :  vendor@example.com');
  console.log('    Vendor 2   :  vendor2@example.com');
  console.log('    Viewer     :  viewer@example.com');
  console.log('    Consultant :  consultant@example.com');
  console.log('    Admin      :  admin@axinfra.local   (password: admin123)');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
