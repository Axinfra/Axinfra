import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ─── String-based enums (matches src/types/index.ts) ────────────────────────
const Role = { OWNER: 'OWNER', PMC: 'PMC', VENDOR: 'VENDOR', VIEWER: 'VIEWER', BUILDER: 'BUILDER', PMC_MANAGER: 'PMC_MANAGER', ENGINEER: 'ENGINEER' } as const;
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
  console.log('🌱 Seeding Axinfra database…\n');

  // ── 1. Wipe all data (respects FK order) ─────────────────────────────────
  console.log('  Clearing existing data…');
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
  await prisma.customView.deleteMany();
  await prisma.projectScheduleConfig.deleteMany();
  await prisma.projectRole.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
  console.log('  Done.\n');

  // ── 2. Users ─────────────────────────────────────────────────────────────
  const hash = await bcrypt.hash('password123', 10);

  const owner = await prisma.user.create({
    data: { name: 'Alex Owner', email: 'owner@example.com', hashedPassword: hash },
  });
  const pmc = await prisma.user.create({
    data: { name: 'Pat PMC', email: 'pmc@example.com', hashedPassword: hash },
  });
  const vendor1 = await prisma.user.create({
    data: { name: 'Victor Vendor', email: 'vendor@example.com', hashedPassword: hash },
  });
  const vendor2 = await prisma.user.create({
    data: { name: 'Sara Subcon', email: 'vendor2@example.com', hashedPassword: hash },
  });
  const viewer = await prisma.user.create({
    data: { name: 'Vera Viewer', email: 'viewer@example.com', hashedPassword: hash },
  });
  // Extended role users (Axinfra)
  const builder = await prisma.user.create({
    data: { name: 'Blake Builder', email: 'builder@example.com', hashedPassword: hash },
  });
  const pmcManager = await prisma.user.create({
    data: { name: 'Morgan PMC-Mgr', email: 'pmcmanager@example.com', hashedPassword: hash },
  });
  const engineer = await prisma.user.create({
    data: { name: 'Ellie Engineer', email: 'engineer@example.com', hashedPassword: hash },
  });
  console.log('  Created 8 users (5 base + 3 extended roles)');

  // ════════════════════════════════════════════════════════════════════════════
  // PROJECT 1 — Downtown Office Building
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
      { projectId: p1.id, userId: owner.id, role: Role.OWNER },
      { projectId: p1.id, userId: pmc.id, role: Role.PMC },
      { projectId: p1.id, userId: vendor1.id, role: Role.VENDOR },
      { projectId: p1.id, userId: vendor2.id, role: Role.VENDOR },
      { projectId: p1.id, userId: viewer.id, role: Role.VIEWER },
      // Extended roles
      { projectId: p1.id, userId: builder.id, role: Role.BUILDER },
      { projectId: p1.id, userId: pmcManager.id, role: Role.PMC_MANAGER },
      { projectId: p1.id, userId: engineer.id, role: Role.ENGINEER },
    ],
  });

  await prisma.projectScheduleConfig.create({
    data: {
      projectId: p1.id,
      projectStartDate: daysAgo(60),
      dailyOverheadCost: 5000,
      penaltyRatePerDay: 0.001,
      opportunityCostFactor: 1.2,
    },
  });

  // BOQ
  const boq1 = await prisma.bOQ.create({ data: { projectId: p1.id, status: BOQStatus.APPROVED } });
  const [b1i1, b1i2, b1i3, b1i4, b1i5] = await Promise.all([
    prisma.bOQItem.create({ data: { boqId: boq1.id, description: 'Foundation concrete work', unit: 'cum', plannedQty: 500, rate: 150, plannedValue: 75000 } }),
    prisma.bOQItem.create({ data: { boqId: boq1.id, description: 'Structural steel framework', unit: 'MT', plannedQty: 200, rate: 2500, plannedValue: 500000 } }),
    prisma.bOQItem.create({ data: { boqId: boq1.id, description: 'Floor slab casting', unit: 'sqm', plannedQty: 5000, rate: 80, plannedValue: 400000 } }),
    prisma.bOQItem.create({ data: { boqId: boq1.id, description: 'External glazing', unit: 'sqm', plannedQty: 2000, rate: 200, plannedValue: 400000 } }),
    prisma.bOQItem.create({ data: { boqId: boq1.id, description: 'MEP installations', unit: 'LS', plannedQty: 1, rate: 300000, plannedValue: 300000 } }),
  ]);

  // ── P1 Milestone 1: Foundation Work (CLOSED) — vendor1 ───────────────────
  const p1m1 = await prisma.milestone.create({
    data: {
      projectId: p1.id, title: 'Foundation Work',
      description: 'Complete foundation concrete work',
      paymentModel: PaymentModel.MILESTONE_COMPLETE,
      plannedStart: daysAgo(35), plannedEnd: daysAgo(7),
      baselinePlannedStart: daysAgo(35), baselinePlannedEnd: daysAgo(7),
      actualStart: daysAgo(30), actualSubmission: daysAgo(14), actualVerification: daysAgo(7),
      state: MilestoneState.CLOSED, value: 75000, advancePercent: 10,
      vendorUserId: vendor1.id, sortOrder: 1,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p1m1.id, boqItemId: b1i1.id, plannedQty: 500 } });
  await prisma.milestoneStateTransition.createMany({
    data: [
      { milestoneId: p1m1.id, fromState: null, toState: MilestoneState.DRAFT, actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(40) },
      { milestoneId: p1m1.id, fromState: MilestoneState.DRAFT, toState: MilestoneState.IN_PROGRESS, actorId: vendor1.id, role: Role.VENDOR, createdAt: daysAgo(30) },
      { milestoneId: p1m1.id, fromState: MilestoneState.IN_PROGRESS, toState: MilestoneState.SUBMITTED, actorId: vendor1.id, role: Role.VENDOR, createdAt: daysAgo(14) },
      { milestoneId: p1m1.id, fromState: MilestoneState.SUBMITTED, toState: MilestoneState.VERIFIED, actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(10) },
      { milestoneId: p1m1.id, fromState: MilestoneState.VERIFIED, toState: MilestoneState.CLOSED, actorId: owner.id, role: Role.OWNER, createdAt: daysAgo(7) },
    ],
  });
  await prisma.evidence.create({
    data: { milestoneId: p1m1.id, submittedById: vendor1.id, qtyOrPercent: 100, remarks: 'Foundation work completed — all 500 cum poured and cured.', frozen: true, status: EvidenceStatus.APPROVED, reviewedAt: daysAgo(10) },
  });
  await prisma.verification.create({
    data: { milestoneId: p1m1.id, verifiedById: pmc.id, qtyVerified: 500, valueEligibleComputed: 75000 },
  });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p1m1.id, boqValueCompleted: 75000, eligibleAmount: 75000,
      advanceAmount: 7500, remainingAmount: 67500,
      state: EligibilityState.MARKED_PAID, dueDate: daysAgo(7),
      markedPaidAt: daysAgo(5), markedPaidByActorId: owner.id, paidExplanation: 'Payment processed via bank transfer',
    },
  });

  // ── P1 Milestone 2: Steel Framework Phase 1 (VERIFIED) — vendor1 ────────
  const p1m2 = await prisma.milestone.create({
    data: {
      projectId: p1.id, title: 'Structural Framework - Phase 1',
      description: 'Steel framework for floors 1-5',
      paymentModel: PaymentModel.PROGRESS_BASED,
      plannedStart: daysAgo(25), plannedEnd: daysFromNow(7),
      baselinePlannedStart: daysAgo(25), baselinePlannedEnd: daysFromNow(5),
      actualStart: daysAgo(21), actualSubmission: daysAgo(5), actualVerification: daysAgo(2),
      state: MilestoneState.VERIFIED, value: 250000, advancePercent: 15,
      vendorUserId: vendor1.id, sortOrder: 2,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p1m2.id, boqItemId: b1i2.id, plannedQty: 100 } });
  await prisma.milestoneStateTransition.createMany({
    data: [
      { milestoneId: p1m2.id, fromState: null, toState: MilestoneState.DRAFT, actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(28) },
      { milestoneId: p1m2.id, fromState: MilestoneState.DRAFT, toState: MilestoneState.IN_PROGRESS, actorId: vendor1.id, role: Role.VENDOR, createdAt: daysAgo(21) },
      { milestoneId: p1m2.id, fromState: MilestoneState.IN_PROGRESS, toState: MilestoneState.SUBMITTED, actorId: vendor1.id, role: Role.VENDOR, createdAt: daysAgo(5) },
      { milestoneId: p1m2.id, fromState: MilestoneState.SUBMITTED, toState: MilestoneState.VERIFIED, actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(2) },
    ],
  });
  await prisma.evidence.create({
    data: { milestoneId: p1m2.id, submittedById: vendor1.id, qtyOrPercent: 100, remarks: 'Floors 1-5 steel framework completed', frozen: true, status: EvidenceStatus.APPROVED, reviewedAt: daysAgo(3) },
  });
  await prisma.verification.create({
    data: { milestoneId: p1m2.id, verifiedById: pmc.id, qtyVerified: 100, valueEligibleComputed: 250000 },
  });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p1m2.id, boqValueCompleted: 250000, eligibleAmount: 250000,
      advanceAmount: 37500, remainingAmount: 212500,
      state: EligibilityState.FULLY_ELIGIBLE, dueDate: daysFromNow(3),
    },
  });

  // ── P1 Milestone 3: Floor Slab L1-3 (SUBMITTED) — vendor2 ───────────────
  const p1m3 = await prisma.milestone.create({
    data: {
      projectId: p1.id, title: 'Floor Slab - Levels 1-3',
      description: 'Concrete slab casting for floors 1-3',
      paymentModel: PaymentModel.MILESTONE_COMPLETE,
      plannedStart: daysAgo(20), plannedEnd: daysFromNow(14),
      baselinePlannedStart: daysAgo(20), baselinePlannedEnd: daysFromNow(10),
      actualStart: daysAgo(14), actualSubmission: daysAgo(3),
      state: MilestoneState.SUBMITTED, value: 120000,
      vendorUserId: vendor2.id, sortOrder: 3,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p1m3.id, boqItemId: b1i3.id, plannedQty: 1500 } });
  await prisma.milestoneStateTransition.createMany({
    data: [
      { milestoneId: p1m3.id, fromState: null, toState: MilestoneState.DRAFT, actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(22) },
      { milestoneId: p1m3.id, fromState: MilestoneState.DRAFT, toState: MilestoneState.IN_PROGRESS, actorId: vendor2.id, role: Role.VENDOR, createdAt: daysAgo(14) },
      { milestoneId: p1m3.id, fromState: MilestoneState.IN_PROGRESS, toState: MilestoneState.SUBMITTED, actorId: vendor2.id, role: Role.VENDOR, createdAt: daysAgo(3) },
    ],
  });
  await prisma.evidence.create({
    data: { milestoneId: p1m3.id, submittedById: vendor2.id, qtyOrPercent: 100, remarks: 'Slab casting complete for L1-L3', frozen: true, status: EvidenceStatus.SUBMITTED, submittedAt: daysAgo(3) },
  });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p1m3.id, remainingAmount: 120000,
      state: EligibilityState.DUE_PENDING_VERIFICATION, dueDate: daysFromNow(14),
    },
  });

  // ── P1 Milestone 4: External Glazing (IN_PROGRESS) — vendor2 ────────────
  const p1m4 = await prisma.milestone.create({
    data: {
      projectId: p1.id, title: 'External Glazing - South Facade',
      description: 'Installation of external glazing on south-facing facade',
      paymentModel: PaymentModel.PROGRESS_BASED,
      plannedStart: daysAgo(12), plannedEnd: daysFromNow(30),
      baselinePlannedStart: daysAgo(12), baselinePlannedEnd: daysFromNow(28),
      actualStart: daysAgo(10),
      state: MilestoneState.IN_PROGRESS, value: 100000, advancePercent: 20,
      vendorUserId: vendor2.id, sortOrder: 4,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p1m4.id, boqItemId: b1i4.id, plannedQty: 500 } });
  await prisma.milestoneStateTransition.createMany({
    data: [
      { milestoneId: p1m4.id, fromState: null, toState: MilestoneState.DRAFT, actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(15) },
      { milestoneId: p1m4.id, fromState: MilestoneState.DRAFT, toState: MilestoneState.IN_PROGRESS, actorId: vendor2.id, role: Role.VENDOR, createdAt: daysAgo(10) },
    ],
  });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p1m4.id, advanceAmount: 20000, remainingAmount: 80000,
      state: EligibilityState.NOT_DUE, dueDate: daysFromNow(30),
    },
  });

  // ── P1 Milestone 5: MEP Rough-In (DRAFT) — unassigned ───────────────────
  const p1m5 = await prisma.milestone.create({
    data: {
      projectId: p1.id, title: 'MEP Rough-In',
      description: 'Mechanical, Electrical, and Plumbing rough-in work',
      paymentModel: PaymentModel.ADVANCE,
      plannedStart: daysFromNow(20), plannedEnd: daysFromNow(45),
      baselinePlannedStart: daysFromNow(20), baselinePlannedEnd: daysFromNow(45),
      state: MilestoneState.DRAFT, value: 300000, advancePercent: 25,
      sortOrder: 5,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p1m5.id, boqItemId: b1i5.id, plannedQty: 1 } });
  await prisma.milestoneStateTransition.create({
    data: { milestoneId: p1m5.id, fromState: null, toState: MilestoneState.DRAFT, actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(5) },
  });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p1m5.id, advanceAmount: 75000, remainingAmount: 225000,
      state: EligibilityState.NOT_DUE, dueDate: daysFromNow(45),
    },
  });

  // ── P1 Dependencies (Gantt edges) ────────────────────────────────────────
  await prisma.milestoneDependency.createMany({
    data: [
      { predecessorId: p1m1.id, successorId: p1m2.id, dependencyType: 'FS', lagDays: 0 },
      { predecessorId: p1m1.id, successorId: p1m3.id, dependencyType: 'FS', lagDays: 2 },
      { predecessorId: p1m2.id, successorId: p1m4.id, dependencyType: 'FS', lagDays: 0 },
      { predecessorId: p1m3.id, successorId: p1m5.id, dependencyType: 'FS', lagDays: 5 },
    ],
  });

  console.log('  Created Project 1: Downtown Office Building (5 milestones, 4 deps)');

  // ════════════════════════════════════════════════════════════════════════════
  // PROJECT 2 — Riverfront Residential Towers
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
    ],
  });

  await prisma.projectScheduleConfig.create({
    data: {
      projectId: p2.id,
      projectStartDate: daysAgo(90),
      dailyOverheadCost: 12000,
      penaltyRatePerDay: 0.002,
      opportunityCostFactor: 1.5,
    },
  });

  const boq2 = await prisma.bOQ.create({ data: { projectId: p2.id, status: BOQStatus.APPROVED } });
  const [b2i1, b2i2] = await Promise.all([
    prisma.bOQItem.create({ data: { boqId: boq2.id, description: 'Piling and foundation', unit: 'LS', plannedQty: 1, rate: 2000000, plannedValue: 2000000 } }),
    prisma.bOQItem.create({ data: { boqId: boq2.id, description: 'Concrete superstructure', unit: 'cum', plannedQty: 15000, rate: 180, plannedValue: 2700000 } }),
  ]);

  // ── P2 Milestone 1: Mobilization (CLOSED) — vendor1 ─────────────────────
  const p2m1 = await prisma.milestone.create({
    data: {
      projectId: p2.id, title: 'Advance Payment - Mobilization',
      description: '20% advance for contractor mobilization',
      paymentModel: PaymentModel.ADVANCE,
      plannedStart: daysAgo(90), plannedEnd: daysAgo(60),
      baselinePlannedStart: daysAgo(90), baselinePlannedEnd: daysAgo(60),
      state: MilestoneState.CLOSED, value: 500000, advancePercent: 100,
      vendorUserId: vendor1.id, sortOrder: 1,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p2m1.id, boqItemId: b2i1.id, plannedQty: 0.2 } });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p2m1.id, boqValueCompleted: 500000, eligibleAmount: 500000,
      advanceAmount: 500000, state: EligibilityState.MARKED_PAID,
      markedPaidAt: daysAgo(58), markedPaidByActorId: owner.id,
    },
  });

  // ── P2 Milestone 2: Piling Tower A (VERIFIED, BLOCKED) — vendor1 ────────
  const p2m2 = await prisma.milestone.create({
    data: {
      projectId: p2.id, title: 'Piling Work - Tower A',
      description: 'Complete piling for Tower A foundation',
      paymentModel: PaymentModel.MILESTONE_COMPLETE,
      plannedStart: daysAgo(60), plannedEnd: daysAgo(20),
      baselinePlannedStart: daysAgo(60), baselinePlannedEnd: daysAgo(25),
      actualStart: daysAgo(55), actualSubmission: daysAgo(25), actualVerification: daysAgo(20),
      state: MilestoneState.VERIFIED, value: 800000, advancePercent: 15,
      vendorUserId: vendor1.id, sortOrder: 2,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p2m2.id, boqItemId: b2i1.id, plannedQty: 0.4 } });
  await prisma.evidence.create({
    data: { milestoneId: p2m2.id, submittedById: vendor1.id, qtyOrPercent: 100, remarks: 'All piles driven and tested', frozen: true, status: EvidenceStatus.APPROVED, reviewedAt: daysAgo(22) },
  });
  await prisma.verification.create({
    data: { milestoneId: p2m2.id, verifiedById: pmc.id, qtyVerified: 0.4, valueEligibleComputed: 800000 },
  });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p2m2.id, boqValueCompleted: 800000, eligibleAmount: 800000,
      advanceAmount: 120000, remainingAmount: 680000, blockedAmount: 800000,
      state: EligibilityState.BLOCKED, dueDate: daysAgo(10),
      blockReasonCode: 'DISPUTE_PENDING', blockExplanation: 'Quantity dispute — awaiting third-party audit',
      blockedAt: daysAgo(18), blockedByActorId: owner.id,
    },
  });

  // ── P2 Milestone 3: Superstructure (IN_PROGRESS) — vendor1 ──────────────
  const p2m3 = await prisma.milestone.create({
    data: {
      projectId: p2.id, title: 'Concrete Superstructure - Tower A L1-10',
      description: 'Concrete pour for Tower A floors 1 through 10',
      paymentModel: PaymentModel.PROGRESS_BASED,
      plannedStart: daysAgo(15), plannedEnd: daysFromNow(60),
      baselinePlannedStart: daysAgo(15), baselinePlannedEnd: daysFromNow(55),
      actualStart: daysAgo(10),
      state: MilestoneState.IN_PROGRESS, value: 1350000, advancePercent: 10,
      vendorUserId: vendor1.id, sortOrder: 3,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p2m3.id, boqItemId: b2i2.id, plannedQty: 7500 } });
  await prisma.milestoneStateTransition.createMany({
    data: [
      { milestoneId: p2m3.id, fromState: null, toState: MilestoneState.DRAFT, actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(20) },
      { milestoneId: p2m3.id, fromState: MilestoneState.DRAFT, toState: MilestoneState.IN_PROGRESS, actorId: vendor1.id, role: Role.VENDOR, createdAt: daysAgo(10) },
    ],
  });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p2m3.id, advanceAmount: 135000, remainingAmount: 1215000,
      state: EligibilityState.NOT_DUE, dueDate: daysFromNow(60),
    },
  });

  // ── P2 Dependencies ──────────────────────────────────────────────────────
  await prisma.milestoneDependency.createMany({
    data: [
      { predecessorId: p2m1.id, successorId: p2m2.id, dependencyType: 'FS', lagDays: 0 },
      { predecessorId: p2m2.id, successorId: p2m3.id, dependencyType: 'FS', lagDays: 3 },
    ],
  });

  console.log('  Created Project 2: Riverfront Residential Towers (3 milestones, 2 deps)');

  // ════════════════════════════════════════════════════════════════════════════
  // PROJECT 3 — Industrial Warehouse Fit-Out  (vendor2-heavy)
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
    ],
  });

  await prisma.projectScheduleConfig.create({
    data: {
      projectId: p3.id,
      projectStartDate: daysAgo(50),
      dailyOverheadCost: 2500,
      penaltyRatePerDay: 0.0015,
      opportunityCostFactor: 1.0,
    },
  });

  const boq3 = await prisma.bOQ.create({ data: { projectId: p3.id, status: BOQStatus.APPROVED } });
  const [b3i1, b3i2, b3i3] = await Promise.all([
    prisma.bOQItem.create({ data: { boqId: boq3.id, description: 'Demolition and site prep', unit: 'LS', plannedQty: 1, rate: 50000, plannedValue: 50000 } }),
    prisma.bOQItem.create({ data: { boqId: boq3.id, description: 'Structural modifications', unit: 'LS', plannedQty: 1, rate: 150000, plannedValue: 150000 } }),
    prisma.bOQItem.create({ data: { boqId: boq3.id, description: 'Cold storage rooms', unit: 'sqm', plannedQty: 5000, rate: 100, plannedValue: 500000 } }),
  ]);

  // ── P3 M1: Demolition (CLOSED) — vendor2 ────────────────────────────────
  const p3m1 = await prisma.milestone.create({
    data: {
      projectId: p3.id, title: 'Demolition Complete',
      description: 'Remove existing fixtures and prepare site',
      paymentModel: PaymentModel.MILESTONE_COMPLETE,
      plannedStart: daysAgo(50), plannedEnd: daysAgo(45),
      baselinePlannedStart: daysAgo(50), baselinePlannedEnd: daysAgo(45),
      state: MilestoneState.CLOSED, value: 50000,
      vendorUserId: vendor2.id, sortOrder: 1,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p3m1.id, boqItemId: b3i1.id, plannedQty: 1 } });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p3m1.id, boqValueCompleted: 50000, eligibleAmount: 50000,
      state: EligibilityState.MARKED_PAID, markedPaidAt: daysAgo(43), markedPaidByActorId: owner.id,
    },
  });

  // ── P3 M2: Structural Steel (VERIFIED) — vendor2 ────────────────────────
  const p3m2 = await prisma.milestone.create({
    data: {
      projectId: p3.id, title: 'Structural Steel Install',
      description: 'Mezzanine reinforcement and structural steel',
      paymentModel: PaymentModel.PROGRESS_BASED,
      plannedStart: daysAgo(42), plannedEnd: daysAgo(35),
      baselinePlannedStart: daysAgo(42), baselinePlannedEnd: daysAgo(35),
      state: MilestoneState.VERIFIED, value: 75000, advancePercent: 20,
      vendorUserId: vendor2.id, sortOrder: 2,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p3m2.id, boqItemId: b3i2.id, plannedQty: 0.5 } });
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

  // ── P3 M3: Cold Storage (IN_PROGRESS) — vendor2 ─────────────────────────
  const p3m3 = await prisma.milestone.create({
    data: {
      projectId: p3.id, title: 'Cold Storage - Insulation',
      description: 'Install insulated panels for cold storage rooms',
      paymentModel: PaymentModel.PROGRESS_BASED,
      plannedStart: daysAgo(12), plannedEnd: daysFromNow(15),
      baselinePlannedStart: daysAgo(12), baselinePlannedEnd: daysFromNow(15),
      actualStart: daysAgo(10),
      state: MilestoneState.IN_PROGRESS, value: 250000, advancePercent: 15,
      vendorUserId: vendor2.id, sortOrder: 3,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p3m3.id, boqItemId: b3i3.id, plannedQty: 2500 } });
  await prisma.milestoneStateTransition.createMany({
    data: [
      { milestoneId: p3m3.id, fromState: null, toState: MilestoneState.DRAFT, actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(15) },
      { milestoneId: p3m3.id, fromState: MilestoneState.DRAFT, toState: MilestoneState.IN_PROGRESS, actorId: vendor2.id, role: Role.VENDOR, createdAt: daysAgo(10) },
    ],
  });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p3m3.id, advanceAmount: 37500, remainingAmount: 212500,
      state: EligibilityState.NOT_DUE, dueDate: daysFromNow(15),
    },
  });

  // ── P3 Dependencies ──────────────────────────────────────────────────────
  await prisma.milestoneDependency.createMany({
    data: [
      { predecessorId: p3m1.id, successorId: p3m2.id, dependencyType: 'FS', lagDays: 0 },
      { predecessorId: p3m2.id, successorId: p3m3.id, dependencyType: 'FS', lagDays: 3 },
    ],
  });

  console.log('  Created Project 3: Industrial Warehouse Fit-Out (3 milestones, 2 deps)');

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n========================================');
  console.log('  Database seeded successfully!');
  console.log('========================================');
  console.log('\n  3 Projects  |  11 Milestones  |  8 Dependencies');
  console.log('  8 Users with role assignments + vendor-milestone links\n');
  console.log('  Demo accounts (all use password: password123):');
  console.log('    Owner       : owner@example.com');
  console.log('    PMC         : pmc@example.com');
  console.log('    Vendor      : vendor@example.com   (Projects 1 & 2)');
  console.log('    Vendor      : vendor2@example.com  (Projects 1 & 3)');
  console.log('    Viewer      : viewer@example.com');
  console.log('    Builder     : builder@example.com     (→ OWNER perms)');
  console.log('    PMC Manager : pmcmanager@example.com  (→ PMC perms)');
  console.log('    Engineer    : engineer@example.com    (→ VENDOR perms)');
  console.log('');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
