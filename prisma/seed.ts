import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// String constants instead of enums for SQLite
const Role = {
  OWNER: 'OWNER',
  PMC: 'PMC',
  VENDOR: 'VENDOR',
  VIEWER: 'VIEWER',
} as const;

const BOQStatus = {
  DRAFT: 'DRAFT',
  APPROVED: 'APPROVED',
  REVISED: 'REVISED',
} as const;

const MilestoneState = {
  DRAFT: 'DRAFT',
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'SUBMITTED',
  VERIFIED: 'VERIFIED',
  CLOSED: 'CLOSED',
} as const;

const PaymentModel = {
  ADVANCE: 'ADVANCE',
  PROGRESS_BASED: 'PROGRESS_BASED',
  MILESTONE_COMPLETE: 'MILESTONE_COMPLETE',
  RETENTION: 'RETENTION',
} as const;

const EvidenceStatus = {
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;

const EligibilityState = {
  NOT_DUE: 'NOT_DUE',
  DUE_PENDING_VERIFICATION: 'DUE_PENDING_VERIFICATION',
  VERIFIED_NOT_ELIGIBLE: 'VERIFIED_NOT_ELIGIBLE',
  PARTIALLY_ELIGIBLE: 'PARTIALLY_ELIGIBLE',
  FULLY_ELIGIBLE: 'FULLY_ELIGIBLE',
  BLOCKED: 'BLOCKED',
  MARKED_PAID: 'MARKED_PAID',
} as const;

const EligibilityEventType = {
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

async function main() {
  console.log('Seeding database...');

  // Clear existing data
  await prisma.auditLog.deleteMany();
  await prisma.followUp.deleteMany();
  await prisma.eligibilityEvent.deleteMany();
  await prisma.paymentEligibility.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.evidenceFile.deleteMany();
  await prisma.evidence.deleteMany();
  await prisma.milestoneStateTransition.deleteMany();
  await prisma.milestoneBOQLink.deleteMany();
  await prisma.milestone.deleteMany();
  await prisma.bOQRevision.deleteMany();
  await prisma.bOQItem.deleteMany();
  await prisma.bOQ.deleteMany();
  await prisma.customView.deleteMany();
  await prisma.projectRole.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();

  // Create users
  const hashedPassword = await bcrypt.hash('password123', 10);

  const owner = await prisma.user.create({
    data: {
      name: 'Alex Owner',
      email: 'owner@example.com',
      hashedPassword,
    },
  });

  const pmc = await prisma.user.create({
    data: {
      name: 'Pat PMC',
      email: 'pmc@example.com',
      hashedPassword,
    },
  });

  const vendor = await prisma.user.create({
    data: {
      name: 'Victor Vendor',
      email: 'vendor@example.com',
      hashedPassword,
    },
  });

  const viewer = await prisma.user.create({
    data: {
      name: 'Vera Viewer',
      email: 'viewer@example.com',
      hashedPassword,
    },
  });

  console.log('Created users');

  // Date helpers
  const now = new Date();
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const daysFromNow = (days: number) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  // ============================================
  // PROJECT 1: Downtown Office Building
  // ============================================

  const project1 = await prisma.project.create({
    data: {
      name: 'Downtown Office Building',
      description: 'A 10-story office building construction project in the downtown area.',
      isExampleProject: true,
    },
  });

  await prisma.projectRole.createMany({
    data: [
      { projectId: project1.id, userId: owner.id, role: Role.OWNER },
      { projectId: project1.id, userId: pmc.id, role: Role.PMC },
      { projectId: project1.id, userId: vendor.id, role: Role.VENDOR },
      { projectId: project1.id, userId: viewer.id, role: Role.VIEWER },
    ],
  });

  const boq1 = await prisma.bOQ.create({
    data: {
      projectId: project1.id,
      status: BOQStatus.APPROVED,
    },
  });

  const boq1Items = await Promise.all([
    prisma.bOQItem.create({
      data: { boqId: boq1.id, description: 'Foundation concrete work', unit: 'cum', plannedQty: 500, rate: 150, plannedValue: 75000 },
    }),
    prisma.bOQItem.create({
      data: { boqId: boq1.id, description: 'Structural steel framework', unit: 'MT', plannedQty: 200, rate: 2500, plannedValue: 500000 },
    }),
    prisma.bOQItem.create({
      data: { boqId: boq1.id, description: 'Floor slab casting', unit: 'sqm', plannedQty: 5000, rate: 80, plannedValue: 400000 },
    }),
    prisma.bOQItem.create({
      data: { boqId: boq1.id, description: 'External glazing', unit: 'sqm', plannedQty: 2000, rate: 200, plannedValue: 400000 },
    }),
    prisma.bOQItem.create({
      data: { boqId: boq1.id, description: 'MEP installations', unit: 'LS', plannedQty: 1, rate: 300000, plannedValue: 300000 },
    }),
  ]);

  // Milestone 1: CLOSED
  const p1m1 = await prisma.milestone.create({
    data: {
      projectId: project1.id,
      title: 'Foundation Work',
      description: 'Complete foundation concrete work',
      paymentModel: PaymentModel.MILESTONE_COMPLETE,
      plannedEnd: daysAgo(7),
      actualStart: daysAgo(30),
      actualSubmission: daysAgo(14),
      actualVerification: daysAgo(7),
      state: MilestoneState.CLOSED,
      value: 75000,
      advancePercent: 10,
    },
  });

  await prisma.milestoneBOQLink.create({ data: { milestoneId: p1m1.id, boqItemId: boq1Items[0].id, plannedQty: 500 } });
  await prisma.milestoneStateTransition.createMany({
    data: [
      { milestoneId: p1m1.id, fromState: null, toState: MilestoneState.DRAFT, actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(35) },
      { milestoneId: p1m1.id, fromState: MilestoneState.DRAFT, toState: MilestoneState.IN_PROGRESS, actorId: vendor.id, role: Role.VENDOR, createdAt: daysAgo(30) },
      { milestoneId: p1m1.id, fromState: MilestoneState.IN_PROGRESS, toState: MilestoneState.SUBMITTED, actorId: vendor.id, role: Role.VENDOR, createdAt: daysAgo(14) },
      { milestoneId: p1m1.id, fromState: MilestoneState.SUBMITTED, toState: MilestoneState.VERIFIED, actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(10) },
      { milestoneId: p1m1.id, fromState: MilestoneState.VERIFIED, toState: MilestoneState.CLOSED, actorId: owner.id, role: Role.OWNER, createdAt: daysAgo(7) },
    ],
  });
  await prisma.evidence.create({
    data: { milestoneId: p1m1.id, submittedById: vendor.id, qtyOrPercent: 100, remarks: 'Foundation work completed', frozen: true, status: EvidenceStatus.APPROVED, reviewedAt: daysAgo(10) },
  });
  await prisma.verification.create({
    data: { milestoneId: p1m1.id, verifiedById: pmc.id, qtyVerified: 500, valueEligibleComputed: 75000 },
  });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p1m1.id,
      boqValueCompleted: 75000,
      eligibleAmount: 75000,
      advanceAmount: 7500,
      remainingAmount: 67500,
      state: EligibilityState.MARKED_PAID,
      dueDate: daysAgo(7),
      markedPaidAt: daysAgo(5),
      markedPaidByActorId: owner.id,
      paidExplanation: 'Payment processed',
    },
  });

  // Milestone 2: VERIFIED
  const p1m2 = await prisma.milestone.create({
    data: {
      projectId: project1.id,
      title: 'Structural Framework - Phase 1',
      description: 'Steel framework for floors 1-5',
      paymentModel: PaymentModel.PROGRESS_BASED,
      plannedEnd: daysFromNow(7),
      actualStart: daysAgo(21),
      actualSubmission: daysAgo(5),
      actualVerification: daysAgo(2),
      state: MilestoneState.VERIFIED,
      value: 250000,
      advancePercent: 15,
    },
  });

  await prisma.milestoneBOQLink.create({ data: { milestoneId: p1m2.id, boqItemId: boq1Items[1].id, plannedQty: 100 } });
  await prisma.milestoneStateTransition.createMany({
    data: [
      { milestoneId: p1m2.id, fromState: null, toState: MilestoneState.DRAFT, actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(25) },
      { milestoneId: p1m2.id, fromState: MilestoneState.DRAFT, toState: MilestoneState.IN_PROGRESS, actorId: vendor.id, role: Role.VENDOR, createdAt: daysAgo(21) },
      { milestoneId: p1m2.id, fromState: MilestoneState.IN_PROGRESS, toState: MilestoneState.SUBMITTED, actorId: vendor.id, role: Role.VENDOR, createdAt: daysAgo(5) },
      { milestoneId: p1m2.id, fromState: MilestoneState.SUBMITTED, toState: MilestoneState.VERIFIED, actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(2) },
    ],
  });
  await prisma.evidence.create({
    data: { milestoneId: p1m2.id, submittedById: vendor.id, qtyOrPercent: 100, remarks: 'Floors 1-5 steel framework completed', frozen: true, status: EvidenceStatus.APPROVED, reviewedAt: daysAgo(3) },
  });
  await prisma.verification.create({
    data: { milestoneId: p1m2.id, verifiedById: pmc.id, qtyVerified: 100, valueEligibleComputed: 250000 },
  });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p1m2.id,
      boqValueCompleted: 250000,
      eligibleAmount: 250000,
      advanceAmount: 37500,
      remainingAmount: 212500,
      state: EligibilityState.FULLY_ELIGIBLE,
      dueDate: daysFromNow(3),
    },
  });

  // Milestone 3: SUBMITTED
  const p1m3 = await prisma.milestone.create({
    data: {
      projectId: project1.id,
      title: 'Floor Slab - Levels 1-3',
      description: 'Concrete slab casting for floors 1-3',
      paymentModel: PaymentModel.MILESTONE_COMPLETE,
      plannedEnd: daysFromNow(14),
      actualStart: daysAgo(14),
      actualSubmission: daysAgo(3),
      state: MilestoneState.SUBMITTED,
      value: 120000,
    },
  });

  await prisma.milestoneBOQLink.create({ data: { milestoneId: p1m3.id, boqItemId: boq1Items[2].id, plannedQty: 1500 } });
  await prisma.milestoneStateTransition.createMany({
    data: [
      { milestoneId: p1m3.id, fromState: null, toState: MilestoneState.DRAFT, actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(20) },
      { milestoneId: p1m3.id, fromState: MilestoneState.DRAFT, toState: MilestoneState.IN_PROGRESS, actorId: vendor.id, role: Role.VENDOR, createdAt: daysAgo(14) },
      { milestoneId: p1m3.id, fromState: MilestoneState.IN_PROGRESS, toState: MilestoneState.SUBMITTED, actorId: vendor.id, role: Role.VENDOR, createdAt: daysAgo(3) },
    ],
  });
  await prisma.evidence.create({
    data: { milestoneId: p1m3.id, submittedById: vendor.id, qtyOrPercent: 100, remarks: 'Slab casting complete', frozen: true, status: EvidenceStatus.SUBMITTED, submittedAt: daysAgo(3) },
  });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p1m3.id,
      remainingAmount: 120000,
      state: EligibilityState.DUE_PENDING_VERIFICATION,
      dueDate: daysFromNow(14),
    },
  });

  // Milestone 4: IN_PROGRESS
  const p1m4 = await prisma.milestone.create({
    data: {
      projectId: project1.id,
      title: 'External Glazing - South Facade',
      description: 'Installation of external glazing',
      paymentModel: PaymentModel.PROGRESS_BASED,
      plannedEnd: daysFromNow(30),
      actualStart: daysAgo(10),
      state: MilestoneState.IN_PROGRESS,
      value: 100000,
      advancePercent: 20,
    },
  });

  await prisma.milestoneBOQLink.create({ data: { milestoneId: p1m4.id, boqItemId: boq1Items[3].id, plannedQty: 500 } });
  await prisma.milestoneStateTransition.createMany({
    data: [
      { milestoneId: p1m4.id, fromState: null, toState: MilestoneState.DRAFT, actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(15) },
      { milestoneId: p1m4.id, fromState: MilestoneState.DRAFT, toState: MilestoneState.IN_PROGRESS, actorId: vendor.id, role: Role.VENDOR, createdAt: daysAgo(10) },
    ],
  });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p1m4.id,
      advanceAmount: 20000,
      remainingAmount: 80000,
      state: EligibilityState.NOT_DUE,
      dueDate: daysFromNow(30),
    },
  });

  // Milestone 5: DRAFT
  const p1m5 = await prisma.milestone.create({
    data: {
      projectId: project1.id,
      title: 'MEP Rough-In',
      description: 'Mechanical, Electrical, and Plumbing rough-in work',
      paymentModel: PaymentModel.ADVANCE,
      plannedEnd: daysFromNow(45),
      state: MilestoneState.DRAFT,
      value: 300000,
      advancePercent: 25,
    },
  });

  await prisma.milestoneBOQLink.create({ data: { milestoneId: p1m5.id, boqItemId: boq1Items[4].id, plannedQty: 1 } });
  await prisma.milestoneStateTransition.create({
    data: { milestoneId: p1m5.id, fromState: null, toState: MilestoneState.DRAFT, actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(5) },
  });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p1m5.id,
      advanceAmount: 75000,
      remainingAmount: 225000,
      state: EligibilityState.NOT_DUE,
      dueDate: daysFromNow(45),
    },
  });

  console.log('Created Project 1: Downtown Office Building');

  // ============================================
  // PROJECT 2: Riverfront Residential Towers
  // ============================================

  const project2 = await prisma.project.create({
    data: {
      name: 'Riverfront Residential Towers',
      description: 'Twin 25-story luxury residential towers.',
      isExampleProject: true,
    },
  });

  await prisma.projectRole.createMany({
    data: [
      { projectId: project2.id, userId: owner.id, role: Role.OWNER },
      { projectId: project2.id, userId: pmc.id, role: Role.PMC },
      { projectId: project2.id, userId: vendor.id, role: Role.VENDOR },
      { projectId: project2.id, userId: viewer.id, role: Role.VIEWER },
    ],
  });

  const boq2 = await prisma.bOQ.create({
    data: { projectId: project2.id, status: BOQStatus.APPROVED },
  });

  const boq2Items = await Promise.all([
    prisma.bOQItem.create({ data: { boqId: boq2.id, description: 'Piling and foundation', unit: 'LS', plannedQty: 1, rate: 2000000, plannedValue: 2000000 } }),
    prisma.bOQItem.create({ data: { boqId: boq2.id, description: 'Concrete superstructure', unit: 'cum', plannedQty: 15000, rate: 180, plannedValue: 2700000 } }),
  ]);

  const p2m1 = await prisma.milestone.create({
    data: {
      projectId: project2.id,
      title: 'Advance Payment - Mobilization',
      description: '20% advance for contractor mobilization',
      paymentModel: PaymentModel.ADVANCE,
      plannedEnd: daysAgo(60),
      state: MilestoneState.CLOSED,
      value: 500000,
      advancePercent: 100,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p2m1.id, boqItemId: boq2Items[0].id, plannedQty: 0.2 } });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p2m1.id,
      boqValueCompleted: 500000,
      eligibleAmount: 500000,
      advanceAmount: 500000,
      state: EligibilityState.MARKED_PAID,
      markedPaidAt: daysAgo(58),
      markedPaidByActorId: owner.id,
    },
  });

  const p2m2 = await prisma.milestone.create({
    data: {
      projectId: project2.id,
      title: 'Piling Work - Tower A',
      description: 'Complete piling for Tower A foundation',
      paymentModel: PaymentModel.MILESTONE_COMPLETE,
      plannedEnd: daysAgo(20),
      actualStart: daysAgo(55),
      actualSubmission: daysAgo(25),
      actualVerification: daysAgo(20),
      state: MilestoneState.VERIFIED,
      value: 800000,
      advancePercent: 15,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p2m2.id, boqItemId: boq2Items[0].id, plannedQty: 0.4 } });
  await prisma.evidence.create({
    data: { milestoneId: p2m2.id, submittedById: vendor.id, qtyOrPercent: 100, remarks: 'All piles driven and tested', frozen: true, status: EvidenceStatus.APPROVED, reviewedAt: daysAgo(22) },
  });
  await prisma.verification.create({
    data: { milestoneId: p2m2.id, verifiedById: pmc.id, qtyVerified: 0.4, valueEligibleComputed: 800000 },
  });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p2m2.id,
      boqValueCompleted: 800000,
      eligibleAmount: 800000,
      advanceAmount: 120000,
      remainingAmount: 680000,
      blockedAmount: 800000,
      state: EligibilityState.BLOCKED,
      dueDate: daysAgo(10),
      blockReasonCode: 'DISPUTE_PENDING',
      blockExplanation: 'Quantity dispute',
      blockedAt: daysAgo(18),
      blockedByActorId: owner.id,
    },
  });

  console.log('Created Project 2: Riverfront Residential Towers');

  // ============================================
  // PROJECT 3: Industrial Warehouse Fit-Out
  // ============================================

  const project3 = await prisma.project.create({
    data: {
      name: 'Industrial Warehouse Fit-Out',
      description: 'Conversion of 50,000 sqft warehouse into modern logistics facility.',
      isExampleProject: true,
    },
  });

  await prisma.projectRole.createMany({
    data: [
      { projectId: project3.id, userId: owner.id, role: Role.OWNER },
      { projectId: project3.id, userId: pmc.id, role: Role.PMC },
      { projectId: project3.id, userId: vendor.id, role: Role.VENDOR },
      { projectId: project3.id, userId: viewer.id, role: Role.VIEWER },
    ],
  });

  const boq3 = await prisma.bOQ.create({
    data: { projectId: project3.id, status: BOQStatus.APPROVED },
  });

  const boq3Items = await Promise.all([
    prisma.bOQItem.create({ data: { boqId: boq3.id, description: 'Demolition and site prep', unit: 'LS', plannedQty: 1, rate: 50000, plannedValue: 50000 } }),
    prisma.bOQItem.create({ data: { boqId: boq3.id, description: 'Structural modifications', unit: 'LS', plannedQty: 1, rate: 150000, plannedValue: 150000 } }),
    prisma.bOQItem.create({ data: { boqId: boq3.id, description: 'Cold storage rooms', unit: 'sqm', plannedQty: 5000, rate: 100, plannedValue: 500000 } }),
  ]);

  const p3m1 = await prisma.milestone.create({
    data: {
      projectId: project3.id,
      title: 'Demolition Complete',
      description: 'Remove existing fixtures',
      paymentModel: PaymentModel.MILESTONE_COMPLETE,
      plannedEnd: daysAgo(45),
      state: MilestoneState.CLOSED,
      value: 50000,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p3m1.id, boqItemId: boq3Items[0].id, plannedQty: 1 } });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p3m1.id,
      boqValueCompleted: 50000,
      eligibleAmount: 50000,
      state: EligibilityState.MARKED_PAID,
      markedPaidAt: daysAgo(43),
      markedPaidByActorId: owner.id,
    },
  });

  const p3m2 = await prisma.milestone.create({
    data: {
      projectId: project3.id,
      title: 'Structural Steel Install',
      description: 'Mezzanine reinforcement',
      paymentModel: PaymentModel.PROGRESS_BASED,
      plannedEnd: daysAgo(35),
      state: MilestoneState.VERIFIED,
      value: 75000,
      advancePercent: 20,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p3m2.id, boqItemId: boq3Items[1].id, plannedQty: 0.5 } });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p3m2.id,
      boqValueCompleted: 75000,
      eligibleAmount: 75000,
      advanceAmount: 15000,
      remainingAmount: 60000,
      state: EligibilityState.FULLY_ELIGIBLE,
      dueDate: daysAgo(30),
    },
  });

  const p3m3 = await prisma.milestone.create({
    data: {
      projectId: project3.id,
      title: 'Cold Storage - Insulation',
      description: 'Install insulated panels',
      paymentModel: PaymentModel.PROGRESS_BASED,
      plannedEnd: daysFromNow(15),
      actualStart: daysAgo(10),
      state: MilestoneState.IN_PROGRESS,
      value: 250000,
      advancePercent: 15,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p3m3.id, boqItemId: boq3Items[2].id, plannedQty: 2500 } });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p3m3.id,
      advanceAmount: 37500,
      remainingAmount: 212500,
      state: EligibilityState.NOT_DUE,
      dueDate: daysFromNow(15),
    },
  });

  console.log('Created Project 3: Industrial Warehouse Fit-Out');

  console.log('\n========================================');
  console.log('Database seeded successfully!');
  console.log('========================================');
  console.log('\n3 Example Projects Created:');
  console.log('  1. Downtown Office Building - Balanced, healthy project');
  console.log('  2. Riverfront Residential Towers - High risk, blocked payments');
  console.log('  3. Industrial Warehouse Fit-Out - Many milestones, rejections');
  console.log('\nDemo accounts:');
  console.log('  Owner: owner@example.com / password123');
  console.log('  PMC: pmc@example.com / password123');
  console.log('  Vendor: vendor@example.com / password123');
  console.log('  Viewer: viewer@example.com / password123');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
