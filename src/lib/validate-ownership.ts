/**
 * validate-ownership.ts — Centralized resource ownership validation.
 *
 * PURPOSE: Prevent IDOR (Insecure Direct Object Reference) attacks by verifying
 * that nested resources (milestones, evidence, BOQs, etc.) actually belong to
 * the project in the URL path. Without this, a user with access to Project A
 * could manipulate resources belonging to Project B by crafting URLs.
 *
 * RULE: Every nested resource access MUST call one of these functions before
 * returning or mutating data.
 */

import { prisma } from '@/lib/db';

/**
 * Generic ownership assertion. Throws a standard error if resource is null.
 * Use this after calling any validate*Ownership function.
 */
export function assertOwnership<T>(resource: T | null, resourceType: string): asserts resource is T {
  if (!resource) {
    throw new OwnershipError(`${resourceType} not found or does not belong to this project`);
  }
}

/** Custom error class for ownership failures — distinguishable from other errors. */
export class OwnershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OwnershipError';
  }
}

/**
 * Validate that a milestone belongs to the specified project.
 * Returns the milestone if valid, null if not found or wrong project.
 */
export async function validateMilestoneOwnership(milestoneId: string, projectId: string) {
  return prisma.milestone.findFirst({
    where: { id: milestoneId, projectId },
  });
}

/**
 * Validate that an evidence record belongs to a milestone in the specified project.
 * Returns the evidence if valid, null if not found or wrong project.
 */
export async function validateEvidenceOwnership(evidenceId: string, projectId: string) {
  return prisma.evidence.findFirst({
    where: {
      id: evidenceId,
      milestone: { projectId },
    },
    include: { milestone: { select: { id: true, projectId: true } } },
  });
}

/**
 * Validate that a BOQ belongs to the specified project.
 * Returns the BOQ if valid, null if not found or wrong project.
 */
export async function validateBOQOwnership(boqId: string, projectId: string) {
  return prisma.bOQ.findFirst({
    where: { id: boqId, projectId },
  });
}

/**
 * Validate that a BOQ item belongs to a BOQ in the specified project.
 * Returns the item if valid, null if not found or wrong project.
 */
export async function validateBOQItemOwnership(itemId: string, projectId: string) {
  return prisma.bOQItem.findFirst({
    where: {
      id: itemId,
      boq: { projectId },
    },
    include: { boq: { select: { id: true, projectId: true, status: true } } },
  });
}

/**
 * Validate that an evidence file belongs to the specified project.
 * Returns the file if valid, null if not found or wrong project.
 */
export async function validateFileOwnership(fileId: string, projectId: string) {
  return prisma.evidenceFile.findFirst({
    where: {
      id: fileId,
      evidence: {
        milestone: { projectId },
      },
    },
  });
}

/**
 * Validate that a custom view belongs to the specified project.
 * Returns the view if valid, null if not found or wrong project.
 */
export async function validateCustomViewOwnership(viewId: string, projectId: string) {
  return prisma.customView.findFirst({
    where: {
      id: viewId,
      projectId,
    },
  });
}

/**
 * Validate that a PaymentEligibility's milestone belongs to the project.
 * Checks milestone→projectId chain.
 */
export async function validatePaymentEligibilityOwnership(milestoneId: string, projectId: string) {
  return prisma.paymentEligibility.findFirst({
    where: {
      milestoneId,
      milestone: { projectId },
    },
  });
}
