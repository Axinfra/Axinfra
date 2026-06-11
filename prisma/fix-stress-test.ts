/**
 * Fix script for Marina Tower stress test data integrity issues.
 *
 * Run: npx tsx prisma/fix-stress-test.ts
 *
 * Fixes:
 * 1. Milestone state distribution (80 CLOSED, 20 SUBMITTED, 35 DRAFT, 15 IN_PROGRESS)
 * 2. Payment eligibility diversification (MARKED_PAID, FULLY_ELIGIBLE, BLOCKED)
 * 3. Creates missing Verification records for CLOSED milestones
 * 4. Creates MilestoneBOQLinks connecting milestones to BOQ items
 * 5. Creates BOQ overrun data for Phase 2 (9% overrun via verifiedQty)
 * 6. Fixes evidence for newly-rejected milestones
 * 7. Fixes monthly ProjectMetrics with phase-specific cost variances
 * 8. Adds missing audit log entries
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PROJECT_NAME = 'Marina Tower — Dubai (Stress Test)';

// Canonical enum values (from src/types/index.ts)
const MilestoneState = {
  DRAFT: 'DRAFT',
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'SUBMITTED',
  VERIFIED: 'VERIFIED',
  CLOSED: 'CLOSED',
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

const Role = { OWNER: 'OWNER', PMC: 'PMC', VENDOR: 'VENDOR', VIEWER: 'VIEWER' } as const;

function dayOffset(base: Date, days: number) {
  return new Date(base.getTime() + days * 86_400_000);
}
function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  // console.log('🔍 STEP 1: Finding Marina Tower project...\n');

  const project = await prisma.project.findFirst({ where: { name: PROJECT_NAME } });
  if (!project) {
    console.error('❌ Project not found. Run seed:stress first.');
    process.exit(1);
  }
  // console.log(`  Project ID: ${project.id}\n`);

  // Get users
  const roles = await prisma.projectRole.findMany({
    where: { projectId: project.id },
    include: { user: true },
  });
  const ownerUser = roles.find(r => r.role === Role.OWNER)!.user;
  const pmcUser = roles.find(r => r.role === Role.PMC)!.user;
  const vendorUsers = roles.filter(r => r.role === Role.VENDOR).map(r => r.user);

  // console.log(`  Owner: ${ownerUser.email}`);
  // console.log(`  PMC: ${pmcUser.email}`);
  // console.log(`  Vendors: ${vendorUsers.map(v => v.email).join(', ')}\n`);

  // ── STEP 2: DIAGNOSE CURRENT STATE ──────────────────────────────────────────
  // console.log('🔍 STEP 2: Diagnosing current state...\n');

  const milestones = await prisma.milestone.findMany({
    where: { projectId: project.id },
    orderBy: { sortOrder: 'asc' },
    include: {
      evidence: true,
      paymentEligibility: true,
      verifications: true,
      boqLinks: true,
    },
  });

  // console.log(`  Total milestones: ${milestones.length}`);

  // Count by state
  const stateCounts: Record<string, number> = {};
  for (const m of milestones) {
    stateCounts[m.state] = (stateCounts[m.state] || 0) + 1;
  }
  // console.log('  Current state distribution:', stateCounts);

  // Count evidence
  const evidenceCounts: Record<string, number> = {};
  for (const m of milestones) {
    for (const e of m.evidence) {
      evidenceCounts[e.status] = (evidenceCounts[e.status] || 0) + 1;
    }
  }
  // console.log('  Evidence statuses:', evidenceCounts);

  // Count payment eligibility states
  const eligCounts: Record<string, number> = {};
  for (const m of milestones) {
    if (m.paymentEligibility) {
      eligCounts[m.paymentEligibility.state] = (eligCounts[m.paymentEligibility.state] || 0) + 1;
    }
  }
  // console.log('  Payment eligibility states:', eligCounts);

  // Check values
  const nullValues = milestones.filter(m => !m.value || m.value === 0).length;
  const totalValue = milestones.reduce((s, m) => s + m.value, 0);
  // console.log(`  Milestones with null/zero value: ${nullValues}`);
  // console.log(`  Total milestone value: AED ${totalValue.toLocaleString()}`);

  // Check verifications
  const totalVerifications = milestones.reduce((s, m) => s + m.verifications.length, 0);
  // console.log(`  Total verification records: ${totalVerifications}`);

  // Check BOQ links
  const totalBoqLinks = milestones.reduce((s, m) => s + m.boqLinks.length, 0);
  // console.log(`  Total BOQ links: ${totalBoqLinks}`);

  // Check null vendorUserId
  const nullVendor = milestones.filter(m => !m.vendorUserId).length;
  // console.log(`  Milestones with null vendorUserId: ${nullVendor}`);

  // BOQ items
  const boq = await prisma.bOQ.findFirst({
    where: { projectId: project.id },
    include: { items: true },
  });
  // console.log(`  BOQ items: ${boq?.items.length || 0}`);

  // Audit log count
  const auditCount = await prisma.auditLog.count({ where: { projectId: project.id } });
  // console.log(`  Audit log entries: ${auditCount}`);

  // console.log('\n');

  // ── STEP 3: FIX MILESTONE STATES ───────────────────────────────────────────
  // Target: 80 CLOSED, 20 SUBMITTED, 35 DRAFT, 15 IN_PROGRESS
  // Current: 80 CLOSED, 20 SUBMITTED, 40 DRAFT, 10 IN_PROGRESS
  // Fix: change 5 DRAFT milestones (idx 135-139) to IN_PROGRESS
  // console.log('🔧 STEP 3: Fixing milestone state distribution...\n');

  // Current distribution per seed:
  // idx 0-79: CLOSED (approved)
  // idx 80-99: SUBMITTED (in review)
  // idx 100-124: DRAFT (pending)
  // idx 125-134: IN_PROGRESS (rejected)
  // idx 135-149: DRAFT (pending)
  //
  // Target:
  // idx 0-79: CLOSED (80 approved)
  // idx 80-99: SUBMITTED (20 in review)
  // idx 100-134: DRAFT (35 pending)
  // idx 135-149: IN_PROGRESS (15 rejected)

  let stateFixCount = 0;
  for (let i = 135; i <= 149; i++) {
    const m = milestones[i];
    if (m && m.state !== MilestoneState.IN_PROGRESS) {
      await prisma.milestone.update({
        where: { id: m.id },
        data: {
          state: MilestoneState.IN_PROGRESS,
          actualStart: dayOffset(m.plannedStart!, randomInt(-2, 3)),
          actualSubmission: dayOffset(m.plannedEnd!, randomInt(-5, 2)),
        },
      });
      stateFixCount++;
    }
  }
  // Fix idx 125-134 — these should be DRAFT per the new distribution, but currently IN_PROGRESS
  // Wait: current seed has idx 125-134 as IN_PROGRESS (rejected). We want idx 100-134 as DRAFT.
  for (let i = 125; i <= 134; i++) {
    const m = milestones[i];
    if (m && m.state !== MilestoneState.DRAFT) {
      await prisma.milestone.update({
        where: { id: m.id },
        data: {
          state: MilestoneState.DRAFT,
          actualStart: null,
          actualSubmission: null,
        },
      });
      stateFixCount++;
    }
  }
  // console.log(`  Fixed ${stateFixCount} milestone states.`);

  // Verify new distribution
  const updatedMilestones = await prisma.milestone.findMany({
    where: { projectId: project.id },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, state: true, value: true, sortOrder: true, plannedEnd: true, vendorUserId: true },
  });
  const newStateCounts: Record<string, number> = {};
  for (const m of updatedMilestones) {
    newStateCounts[m.state] = (newStateCounts[m.state] || 0) + 1;
  }
  // console.log('  New state distribution:', newStateCounts);

  // ── STEP 3b: FIX EVIDENCE FOR STATE CHANGES ─────────────────────────────────
  // console.log('\n🔧 STEP 3b: Fixing evidence for state-changed milestones...\n');

  // Delete old evidence for milestones that changed state (idx 125-149)
  // idx 125-134: were IN_PROGRESS (rejected) with REJECTED evidence → now DRAFT (pending), delete evidence
  // idx 135-149: were DRAFT (pending) with no evidence → now IN_PROGRESS (rejected), need REJECTED evidence

  for (let i = 125; i <= 134; i++) {
    const m = milestones[i];
    if (m.evidence.length > 0) {
      // Delete evidence files first, then evidence
      for (const ev of m.evidence) {
        await prisma.evidenceFile.deleteMany({ where: { evidenceId: ev.id } });
      }
      await prisma.evidence.deleteMany({ where: { milestoneId: m.id } });
    }
  }
  // console.log('  Deleted evidence for 10 milestones changed from IN_PROGRESS to DRAFT.');

  // Create REJECTED evidence for idx 135-149
  let newEvidenceCount = 0;
  for (let i = 135; i <= 149; i++) {
    const m = milestones[i];
    const vendorId = m.vendorUserId || vendorUsers[vendorUsers.length - 1].id;

    // Only create if no evidence exists
    const existingEvidence = await prisma.evidence.count({ where: { milestoneId: m.id } });
    if (existingEvidence === 0) {
      await prisma.evidence.create({
        data: {
          milestoneId: m.id,
          submittedById: vendorId,
          submittedAt: dayOffset(m.plannedEnd!, -randomInt(1, 5)),
          qtyOrPercent: 80,
          remarks: 'Initial submission for review.',
          frozen: true,
          status: EvidenceStatus.REJECTED,
          reviewedAt: dayOffset(m.plannedEnd!, randomInt(1, 5)),
          reviewNote: 'Quality does not meet specification. Refer to consultant comments for rectification items.',
          files: {
            create: [{
              storageKey: `stress-test/milestone-${i + 1}-photo.jpg`,
              fileName: `milestone-${i + 1}-photo.jpg`,
              mimeType: 'image/jpeg',
              size: 2048000,
              filePath: `/evidence/stress-test/milestone-${i + 1}-photo.jpg`,
            }],
          },
        },
      });
      newEvidenceCount++;
    }
  }
  // console.log(`  Created ${newEvidenceCount} REJECTED evidence records for newly-rejected milestones.`);

  // ── STEP 4: CREATE VERIFICATION RECORDS ─────────────────────────────────────
  // console.log('\n🔧 STEP 4: Creating Verification records for CLOSED milestones...\n');

  // Delete any existing verifications first
  const closedMilestoneIds = updatedMilestones.filter(m => m.state === MilestoneState.CLOSED).map(m => m.id);
  await prisma.verification.deleteMany({ where: { milestoneId: { in: closedMilestoneIds } } });

  let verificationCount = 0;
  for (let i = 0; i < 80; i++) {
    const m = milestones[i]; // original data with dates
    const updated = updatedMilestones[i];

    const verifiedAt = m.actualVerification || dayOffset(m.plannedEnd!, randomInt(1, 5));

    await prisma.verification.create({
      data: {
        milestoneId: updated.id,
        verifiedById: pmcUser.id,
        verifiedAt,
        notes: 'Work verified and approved per specification requirements.',
        qtyVerified: 100,
        valueEligibleComputed: updated.value,
      },
    });
    verificationCount++;
  }
  // console.log(`  Created ${verificationCount} verification records.`);

  // ── STEP 5: FIX PAYMENT ELIGIBILITY ─────────────────────────────────────────
  // console.log('\n🔧 STEP 5: Fixing payment eligibility records...\n');

  // Calculate which milestones to mark as paid to reach ~AED 6.5M
  let cumPaid = 0;
  const paidIndices: number[] = [];
  for (let i = 0; i < 80; i++) {
    if (cumPaid >= 6_500_000) break;
    cumPaid += updatedMilestones[i].value;
    paidIndices.push(i);
  }
  // console.log(`  Milestones marked as paid: ${paidIndices.length} (total: AED ${cumPaid.toLocaleString()})`);

  // Indices for different payment states
  const fullyEligibleReadyIndices = [paidIndices.length, paidIndices.length + 1, paidIndices.length + 2, paidIndices.length + 3, paidIndices.length + 4]; // 5 ready
  const overdueIndices = [paidIndices.length + 5, paidIndices.length + 6]; // 2 overdue
  const blockedIndices = [80, 81, 82]; // 3 from SUBMITTED milestones

  // Update all payment eligibility records
  for (let i = 0; i < updatedMilestones.length; i++) {
    const m = updatedMilestones[i];
    const pe = milestones[i]?.paymentEligibility;
    if (!pe) continue;

    if (paidIndices.includes(i)) {
      // MARKED_PAID — earliest milestones (Phase 1 + early Phase 2)
      const completedAt = milestones[i].actualVerification || dayOffset(milestones[i].plannedEnd!, 5);
      const paidAt = dayOffset(completedAt, randomInt(5, 15));

      await prisma.paymentEligibility.update({
        where: { id: pe.id },
        data: {
          state: EligibilityState.MARKED_PAID,
          eligibleAmount: m.value,
          boqValueCompleted: m.value,
          remainingAmount: 0,
          blockedAmount: 0,
          markedPaidAt: paidAt,
          markedPaidByActorId: ownerUser.id,
          paidExplanation: 'Payment processed upon milestone verification and approval.',
          dueDate: m.plannedEnd,
        },
      });
    } else if (fullyEligibleReadyIndices.includes(i)) {
      // FULLY_ELIGIBLE — ready for payment
      await prisma.paymentEligibility.update({
        where: { id: pe.id },
        data: {
          state: EligibilityState.FULLY_ELIGIBLE,
          eligibleAmount: m.value,
          boqValueCompleted: m.value,
          remainingAmount: m.value,
          blockedAmount: 0,
          markedPaidAt: null,
          markedPaidByActorId: null,
          paidExplanation: null,
          dueDate: dayOffset(new Date(), -randomInt(1, 10)), // due recently
        },
      });
    } else if (overdueIndices.includes(i)) {
      // FULLY_ELIGIBLE but overdue (due 30+ days ago)
      await prisma.paymentEligibility.update({
        where: { id: pe.id },
        data: {
          state: EligibilityState.FULLY_ELIGIBLE,
          eligibleAmount: m.value,
          boqValueCompleted: m.value,
          remainingAmount: m.value,
          blockedAmount: 0,
          markedPaidAt: null,
          markedPaidByActorId: null,
          paidExplanation: null,
          dueDate: dayOffset(new Date(), -randomInt(35, 60)), // overdue
        },
      });
    } else if (blockedIndices.includes(i)) {
      // BLOCKED — SUBMITTED milestones with payment held
      await prisma.paymentEligibility.update({
        where: { id: pe.id },
        data: {
          state: EligibilityState.BLOCKED,
          eligibleAmount: 0,
          boqValueCompleted: 0,
          remainingAmount: 0,
          blockedAmount: m.value,
          blockReasonCode: 'EVIDENCE_UNDER_REVIEW',
          blockExplanation: 'Evidence under review — payment held pending PMC approval',
          blockedAt: dayOffset(new Date(), -randomInt(5, 20)),
          blockedByActorId: pmcUser.id,
          markedPaidAt: null,
          markedPaidByActorId: null,
          paidExplanation: null,
          dueDate: m.plannedEnd,
        },
      });
    } else if (m.state === MilestoneState.CLOSED) {
      // Remaining CLOSED milestones → FULLY_ELIGIBLE (verified, payment pending)
      await prisma.paymentEligibility.update({
        where: { id: pe.id },
        data: {
          state: EligibilityState.FULLY_ELIGIBLE,
          eligibleAmount: m.value,
          boqValueCompleted: m.value,
          remainingAmount: m.value,
          blockedAmount: 0,
          markedPaidAt: null,
          markedPaidByActorId: null,
          paidExplanation: null,
          dueDate: dayOffset(milestones[i].plannedEnd!, randomInt(5, 15)),
        },
      });
    } else if (m.state === MilestoneState.SUBMITTED) {
      // IN_REVIEW milestones → DUE_PENDING_VERIFICATION
      await prisma.paymentEligibility.update({
        where: { id: pe.id },
        data: {
          state: EligibilityState.DUE_PENDING_VERIFICATION,
          eligibleAmount: 0,
          boqValueCompleted: 0,
          remainingAmount: 0,
          blockedAmount: 0,
          markedPaidAt: null,
          markedPaidByActorId: null,
          paidExplanation: null,
          dueDate: m.plannedEnd,
        },
      });
    } else {
      // DRAFT / IN_PROGRESS → NOT_DUE
      await prisma.paymentEligibility.update({
        where: { id: pe.id },
        data: {
          state: EligibilityState.NOT_DUE,
          eligibleAmount: 0,
          boqValueCompleted: 0,
          remainingAmount: 0,
          blockedAmount: 0,
          markedPaidAt: null,
          markedPaidByActorId: null,
          paidExplanation: null,
          dueDate: m.plannedEnd,
        },
      });
    }
  }

  // Verify payment distribution
  const peStates = await prisma.paymentEligibility.groupBy({
    by: ['state'],
    where: { milestone: { projectId: project.id } },
    _count: true,
    _sum: { eligibleAmount: true, blockedAmount: true },
  });
  // console.log('  Payment eligibility distribution:');
  for (const pe of peStates) {
    // console.log(`    ${pe.state}: ${pe._count} records, eligible=AED ${(pe._sum.eligibleAmount || 0).toLocaleString()}, blocked=AED ${(pe._sum.blockedAmount || 0).toLocaleString()}`);
  }

  // ── STEP 6: CREATE MILESTONE-BOQ LINKS ──────────────────────────────────────
  // console.log('\n🔧 STEP 6: Creating MilestoneBOQLinks...\n');

  if (!boq) {
    console.error('  ❌ No BOQ found!');
  } else {
    // Delete existing links
    await prisma.milestoneBOQLink.deleteMany({
      where: { milestoneId: { in: updatedMilestones.map(m => m.id) } },
    });

    // Phase ranges for milestones
    const phaseRanges = [
      { phase: 1, start: 0, end: 19 },   // 20 milestones
      { phase: 2, start: 20, end: 59 },   // 40 milestones
      { phase: 3, start: 60, end: 89 },   // 30 milestones
      { phase: 4, start: 90, end: 129 },  // 40 milestones
      { phase: 5, start: 130, end: 149 }, // 20 milestones
    ];

    // Assign BOQ items to phases by recreating the phase logic from seed
    const phaseBoqCounts = [7, 6, 8, 8, 7]; // items per phase from getPhaseBoqItems
    let boqIdx = 0;
    const boqByPhase: Record<number, typeof boq.items> = {};
    for (let phase = 1; phase <= 5; phase++) {
      boqByPhase[phase] = boq.items.slice(boqIdx, boqIdx + phaseBoqCounts[phase - 1]);
      boqIdx += phaseBoqCounts[phase - 1];
    }

    let linkCount = 0;
    for (const range of phaseRanges) {
      const phaseItems = boqByPhase[range.phase] || [];
      if (phaseItems.length === 0) continue;

      const milestoneCount = range.end - range.start + 1;

      for (let i = range.start; i <= range.end; i++) {
        // Each milestone links to 1-2 BOQ items from its phase
        const itemIdx = (i - range.start) % phaseItems.length;
        const item = phaseItems[itemIdx];

        // Distribute qty proportionally
        const proportionalQty = item.plannedQty / milestoneCount;

        await prisma.milestoneBOQLink.create({
          data: {
            milestoneId: updatedMilestones[i].id,
            boqItemId: item.id,
            plannedQty: proportionalQty,
          },
        });
        linkCount++;
      }
    }
    // console.log(`  Created ${linkCount} MilestoneBOQLinks.`);

    // ── STEP 6b: Create BOQ overrun data via Verification qtyVerified ────────
    // For Phase 2 milestones (idx 20-59), the verifications should have qtyVerified > proportionalQty
    // This triggers detectBOQOverruns which checks verifiedQty > plannedQty per BOQ item

    // console.log('\n🔧 STEP 6b: Adjusting verification qtyVerified for Phase 2 BOQ overrun...\n');

    // For Phase 2 BOQ items, we need total verifiedQty > plannedQty (9% overrun)
    // Each Phase 2 milestone verification qtyVerified was set to 100 (percentage)
    // But detectBOQOverruns sums qtyVerified from verifications via MilestoneBOQLink
    // So we need: sum of qtyVerified for all milestones linked to a BOQ item > item.plannedQty

    // Update Phase 2 verifications: set qtyVerified to proportionalQty * 1.09
    for (let i = 20; i < 60; i++) {
      if (updatedMilestones[i].state !== MilestoneState.CLOSED) continue;

      const links = await prisma.milestoneBOQLink.findMany({
        where: { milestoneId: updatedMilestones[i].id },
      });

      for (const link of links) {
        await prisma.verification.updateMany({
          where: { milestoneId: updatedMilestones[i].id },
          data: { qtyVerified: link.plannedQty * 1.09 },
        });
      }
    }

    // For Phase 3 (underrun): qtyVerified = proportionalQty * 0.97
    for (let i = 60; i < 80; i++) {
      if (updatedMilestones[i].state !== MilestoneState.CLOSED) continue;

      const links = await prisma.milestoneBOQLink.findMany({
        where: { milestoneId: updatedMilestones[i].id },
      });

      for (const link of links) {
        await prisma.verification.updateMany({
          where: { milestoneId: updatedMilestones[i].id },
          data: { qtyVerified: link.plannedQty * 0.97 },
        });
      }
    }

    // console.log('  Phase 2 verifications adjusted for 9% overrun.');
    // console.log('  Phase 3 verifications adjusted for 3% underrun.');
  }

  // ── STEP 7: FIX MONTHLY COST SNAPSHOTS ──────────────────────────────────────
  // console.log('\n🔧 STEP 7: Fixing monthly ProjectMetrics with cost variances...\n');

  // Delete existing metrics
  await prisma.projectMetrics.deleteMany({ where: { projectId: project.id } });

  const CONTRACT_VALUE = 45_000_000;
  // Monthly planned spend (S-curve, even distribution)
  const MONTHLY_PLANNED = Array.from({ length: 24 }, () => Math.round(CONTRACT_VALUE / 24));

  // Monthly actual spend with phase-specific variances:
  // Months 1-6: Phase 1, on budget (±1%)
  // Months 7-14: Phase 2, 9% overrun
  // Months 15-18: Phase 3, 3% underrun
  // Months 19-24: Phase 4-5, on budget (±1%)
  const baseActualSpend = [
    280_000, 420_000, 680_000, 1_100_000, 1_650_000, 2_200_000,   // Phase 1
    2_800_000, 3_100_000, 3_400_000, 3_600_000, 3_550_000, 3_200_000, 2_900_000, 2_600_000, // Phase 2
    2_300_000, 2_100_000, 1_900_000, 1_700_000,                   // Phase 3
    1_400_000, 1_100_000, 850_000, 620_000, 380_000, 170_000,     // Phase 4-5
  ];

  const actualSpend = baseActualSpend.map((val, month) => {
    if (month < 6) return Math.round(val * (0.99 + Math.random() * 0.02)); // ±1%
    if (month < 14) return Math.round(val * 1.09); // 9% overrun
    if (month < 18) return Math.round(val * 0.97); // 3% underrun
    return Math.round(val * (0.99 + Math.random() * 0.02)); // ±1%
  });

  let cumulativePlanned = 0;
  let cumulativeActual = 0;

  for (let month = 0; month < 24; month++) {
    cumulativePlanned += MONTHLY_PLANNED[month];
    cumulativeActual += actualSpend[month];

    const earnedValue = cumulativeActual * 0.95;

    await prisma.projectMetrics.create({
      data: {
        projectId: project.id,
        period: `2024-${String(month + 1).padStart(2, '0')}`,
        totalBudget: CONTRACT_VALUE,
        spentToDate: cumulativeActual,
        earnedValue,
        plannedValue: cumulativePlanned,
        costVariance: cumulativePlanned - cumulativeActual,
        scheduleVariance: month < 18 ? 0 : -(cumulativeActual - cumulativePlanned) * 0.1,
        cpi: cumulativeActual > 0 ? earnedValue / cumulativeActual : 1,
        spi: cumulativePlanned > 0 ? earnedValue / cumulativePlanned : 1,
        milestonesTotal: 150,
        milestonesComplete: Math.min(80, Math.round((month / 18) * 80)),
        milestonesOverdue: month > 6 ? randomInt(1, 5) : 0,
        healthStatus: month < 6 ? 'GREEN' : (month < 14 ? 'AMBER' : (month < 18 ? 'GREEN' : 'GREEN')),
      },
    });
  }
  // console.log('  ✓ 24 monthly cost snapshots recreated with phase-specific variances.');
  // console.log(`    Months 7-14 (Phase 2): +9% overrun`);
  // console.log(`    Months 15-18 (Phase 3): -3% underrun`);
  // console.log(`    Other months: ±1%`);

  // ── STEP 8: FIX AUDIT LOG ──────────────────────────────────────────────────
  // console.log('\n🔧 STEP 8: Adding missing audit log entries...\n');

  const now = new Date();
  const projectStart = new Date(now.getTime() - 24 * 30.44 * 86_400_000);
  const monthOffset = (m: number) => new Date(projectStart.getTime() + m * 30.44 * 86_400_000);

  // Add PAYMENT_ELIGIBLE entries for FULLY_ELIGIBLE milestones
  const newAuditEntries: Array<{
    projectId: string; actorId: string; role: string; actionType: string;
    entityType: string; entityId: string; beforeJson?: string | null; afterJson?: string | null;
    reason?: string | null; createdAt: Date;
  }> = [];

  // Payment eligible events for non-MARKED_PAID closed milestones
  for (let i = paidIndices.length; i < 80; i++) {
    const m = updatedMilestones[i];
    const completedAt = milestones[i].actualVerification || dayOffset(milestones[i].plannedEnd!, 5);

    newAuditEntries.push({
      projectId: project.id,
      actorId: pmcUser.id,
      role: Role.PMC,
      actionType: 'ELIGIBILITY_STATE_CHANGE',
      entityType: 'PaymentEligibility',
      entityId: m.id,
      afterJson: JSON.stringify({ state: 'FULLY_ELIGIBLE', amount: m.value }),
      createdAt: dayOffset(completedAt, randomInt(1, 3)),
    });
  }

  // Payment released events for MARKED_PAID milestones
  for (const idx of paidIndices) {
    const m = updatedMilestones[idx];
    const completedAt = milestones[idx].actualVerification || dayOffset(milestones[idx].plannedEnd!, 5);

    newAuditEntries.push({
      projectId: project.id,
      actorId: ownerUser.id,
      role: Role.OWNER,
      actionType: 'ELIGIBILITY_MARKED_PAID',
      entityType: 'PaymentEligibility',
      entityId: m.id,
      afterJson: JSON.stringify({ state: 'MARKED_PAID', amount: m.value }),
      createdAt: dayOffset(completedAt, randomInt(5, 15)),
    });
  }

  // Blocked payment events
  for (const idx of blockedIndices) {
    const m = updatedMilestones[idx];
    newAuditEntries.push({
      projectId: project.id,
      actorId: pmcUser.id,
      role: Role.PMC,
      actionType: 'ELIGIBILITY_STATE_CHANGE',
      entityType: 'PaymentEligibility',
      entityId: m.id,
      afterJson: JSON.stringify({ state: 'BLOCKED', reason: 'Evidence under review' }),
      createdAt: dayOffset(new Date(), -randomInt(5, 20)),
    });
  }

  // BOQ variance flagged entries for Phase 2
  if (boq) {
    const phase2Items = boq.items.slice(7, 13); // Phase 2 items (indices 7-12 in the flat list)
    for (const item of phase2Items) {
      newAuditEntries.push({
        projectId: project.id,
        actorId: pmcUser.id,
        role: Role.PMC,
        actionType: 'BOQ_ITEM_UPDATE',
        entityType: 'BOQItem',
        entityId: item.id,
        afterJson: JSON.stringify({
          description: item.description,
          variance: '9% over budget',
          note: 'Concrete unit rate increased from AED 320/m³ to AED 358/m³ — approved variation order VO-007',
        }),
        createdAt: monthOffset(14),
      });
    }
  }

  // Milestone state transition entries for newly-rejected milestones (idx 135-149)
  for (let i = 135; i <= 149; i++) {
    const m = milestones[i];
    const vendorId = m.vendorUserId || vendorUsers[vendorUsers.length - 1].id;
    const submitDate = dayOffset(m.plannedEnd!, -randomInt(5, 15));
    const rejectDate = dayOffset(submitDate, randomInt(3, 7));

    newAuditEntries.push(
      {
        projectId: project.id, actorId: vendorId, role: Role.VENDOR,
        actionType: 'MILESTONE_STATE_TRANSITION', entityType: 'Milestone', entityId: m.id,
        afterJson: JSON.stringify({ state: 'SUBMITTED' }), createdAt: submitDate,
      },
      {
        projectId: project.id, actorId: pmcUser.id, role: Role.PMC,
        actionType: 'MILESTONE_STATE_TRANSITION', entityType: 'Milestone', entityId: m.id,
        afterJson: JSON.stringify({ state: 'IN_REVIEW' }), createdAt: dayOffset(submitDate, 1),
      },
      {
        projectId: project.id, actorId: pmcUser.id, role: Role.PMC,
        actionType: 'MILESTONE_STATE_TRANSITION', entityType: 'Milestone', entityId: m.id,
        afterJson: JSON.stringify({ state: 'REJECTED' }),
        reason: 'Quality does not meet specification requirements.',
        createdAt: rejectDate,
      },
      {
        projectId: project.id, actorId: vendorId, role: Role.VENDOR,
        actionType: 'EVIDENCE_SUBMIT', entityType: 'Evidence', entityId: m.id,
        createdAt: dayOffset(submitDate, -1),
      },
      {
        projectId: project.id, actorId: pmcUser.id, role: Role.PMC,
        actionType: 'EVIDENCE_REJECT', entityType: 'Evidence', entityId: m.id,
        reason: 'Submission does not demonstrate completion to required standard.',
        createdAt: rejectDate,
      },
    );
  }

  // Remove old audit entries for milestones 126-135 that changed state and add placeholder ones
  // (We'll leave existing entries and just add new ones)

  // Sort and batch insert
  newAuditEntries.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const BATCH_SIZE = 100;
  for (let i = 0; i < newAuditEntries.length; i += BATCH_SIZE) {
    const batch = newAuditEntries.slice(i, i + BATCH_SIZE);
    await prisma.auditLog.createMany({ data: batch });
  }
  // console.log(`  Added ${newAuditEntries.length} new audit log entries.`);

  const finalAuditCount = await prisma.auditLog.count({ where: { projectId: project.id } });
  // console.log(`  Total audit log entries: ${finalAuditCount}`);

  // ── STEP 9: CREATE ELIGIBILITY EVENTS ───────────────────────────────────────
  // console.log('\n🔧 STEP 9: Creating eligibility events for payment state transitions...\n');

  // Delete existing eligibility events
  await prisma.eligibilityEvent.deleteMany({
    where: { paymentEligibility: { milestone: { projectId: project.id } } },
  });

  let eventCount = 0;

  // For MARKED_PAID milestones: NOT_DUE → FULLY_ELIGIBLE → MARKED_PAID
  for (const idx of paidIndices) {
    const m = updatedMilestones[idx];
    const pe = await prisma.paymentEligibility.findUnique({ where: { milestoneId: m.id } });
    if (!pe) continue;

    const completedAt = milestones[idx].actualVerification || dayOffset(milestones[idx].plannedEnd!, 5);

    await prisma.eligibilityEvent.createMany({
      data: [
        {
          paymentEligibilityId: pe.id,
          eventType: 'VERIFICATION_CREATED',
          fromState: 'NOT_DUE',
          toState: 'FULLY_ELIGIBLE',
          actorId: pmcUser.id,
          actorRole: Role.PMC,
          eligibleAmountBefore: 0,
          eligibleAmountAfter: m.value,
          reasonCode: 'MILESTONE_VERIFIED',
          explanation: 'Milestone verified and eligible for payment.',
          createdAt: dayOffset(completedAt, 1),
        },
        {
          paymentEligibilityId: pe.id,
          eventType: 'MILESTONE_STATE_CHANGED',
          fromState: 'FULLY_ELIGIBLE',
          toState: 'MARKED_PAID',
          actorId: ownerUser.id,
          actorRole: Role.OWNER,
          eligibleAmountBefore: m.value,
          eligibleAmountAfter: m.value,
          reasonCode: 'PAYMENT_RELEASED',
          explanation: 'Payment released to vendor.',
          createdAt: dayOffset(completedAt, randomInt(5, 15)),
        },
      ],
    });
    eventCount += 2;
  }

  // For FULLY_ELIGIBLE milestones: NOT_DUE → FULLY_ELIGIBLE
  for (let i = paidIndices.length; i < 80; i++) {
    if (blockedIndices.includes(i)) continue;
    const m = updatedMilestones[i];
    const pe = await prisma.paymentEligibility.findUnique({ where: { milestoneId: m.id } });
    if (!pe) continue;

    const completedAt = milestones[i].actualVerification || dayOffset(milestones[i].plannedEnd!, 5);

    await prisma.eligibilityEvent.create({
      data: {
        paymentEligibilityId: pe.id,
        eventType: 'VERIFICATION_CREATED',
        fromState: 'NOT_DUE',
        toState: 'FULLY_ELIGIBLE',
        actorId: pmcUser.id,
        actorRole: Role.PMC,
        eligibleAmountBefore: 0,
        eligibleAmountAfter: m.value,
        reasonCode: 'MILESTONE_VERIFIED',
        explanation: 'Milestone verified and eligible for payment.',
        createdAt: dayOffset(completedAt, 1),
      },
    });
    eventCount++;
  }

  // For BLOCKED milestones
  for (const idx of blockedIndices) {
    const m = updatedMilestones[idx];
    const pe = await prisma.paymentEligibility.findUnique({ where: { milestoneId: m.id } });
    if (!pe) continue;

    await prisma.eligibilityEvent.create({
      data: {
        paymentEligibilityId: pe.id,
        eventType: 'EVIDENCE_SUBMITTED',
        fromState: 'NOT_DUE',
        toState: 'BLOCKED',
        actorId: pmcUser.id,
        actorRole: Role.PMC,
        eligibleAmountBefore: 0,
        eligibleAmountAfter: 0,
        reasonCode: 'EVIDENCE_UNDER_REVIEW',
        explanation: 'Evidence under review — payment held pending PMC approval.',
        createdAt: dayOffset(new Date(), -randomInt(5, 20)),
      },
    });
    eventCount++;
  }

  // console.log(`  Created ${eventCount} eligibility events.`);

  // ── FINAL SUMMARY ──────────────────────────────────────────────────────────
  // console.log('\n' + '═'.repeat(60));
  // console.log('  ✅ DATA FIX COMPLETE');
  // console.log('═'.repeat(60));

  // Final verification queries
  const finalMilestones = await prisma.milestone.findMany({
    where: { projectId: project.id },
    orderBy: { sortOrder: 'asc' },
    select: { state: true, value: true },
  });

  const finalStateCounts: Record<string, number> = {};
  for (const m of finalMilestones) {
    finalStateCounts[m.state] = (finalStateCounts[m.state] || 0) + 1;
  }

  const closedValue = finalMilestones.filter(m => m.state === MilestoneState.CLOSED).reduce((s, m) => s + m.value, 0);
  const submittedValue = finalMilestones.filter(m => m.state === MilestoneState.SUBMITTED).reduce((s, m) => s + m.value, 0);
  const draftValue = finalMilestones.filter(m => m.state === MilestoneState.DRAFT).reduce((s, m) => s + m.value, 0);

  const finalPE = await prisma.paymentEligibility.findMany({
    where: { milestone: { projectId: project.id } },
    select: { state: true, eligibleAmount: true, blockedAmount: true },
  });
  const paidTotal = finalPE.filter(p => p.state === EligibilityState.MARKED_PAID).reduce((s, p) => s + p.eligibleAmount, 0);
  const verifiedTotal = closedValue;
  const blockedTotal = finalPE.filter(p => p.state === EligibilityState.BLOCKED).reduce((s, p) => s + p.blockedAmount, 0);

  // console.log(`\n  Milestone States: ${JSON.stringify(finalStateCounts)}`);
  // console.log(`  Total Contract Value: AED ${CONTRACT_VALUE.toLocaleString()}`);
  // console.log(`  Verified Value (CLOSED milestones): AED ${verifiedTotal.toLocaleString()}`);
  // console.log(`  Exposed Value (SUBMITTED + DRAFT): AED ${(submittedValue + draftValue).toLocaleString()}`);
  // console.log(`  Released Payments (MARKED_PAID): AED ${paidTotal.toLocaleString()}`);
  // console.log(`  Blocked Payments: AED ${blockedTotal.toLocaleString()}`);
  // console.log(`  Unpaid (Verified - Paid): AED ${(verifiedTotal - paidTotal).toLocaleString()}`);

  const finalAudit = await prisma.auditLog.count({ where: { projectId: project.id } });
  const finalEvidence = await prisma.evidence.count({ where: { milestone: { projectId: project.id } } });
  const finalVerifications = await prisma.verification.count({ where: { milestone: { projectId: project.id } } });
  const finalLinks = await prisma.milestoneBOQLink.count({ where: { milestone: { projectId: project.id } } });
  const finalEvents = await prisma.eligibilityEvent.count({ where: { paymentEligibility: { milestone: { projectId: project.id } } } });

  // console.log(`\n  Evidence records: ${finalEvidence}`);
  // console.log(`  Verification records: ${finalVerifications}`);
  // console.log(`  BOQ links: ${finalLinks}`);
  // console.log(`  Eligibility events: ${finalEvents}`);
  // console.log(`  Audit log entries: ${finalAudit}`);
  // console.log('═'.repeat(60));
}

main()
  .catch((e) => {
    console.error('❌ Fix failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
