/*
  Warnings:

  - You are about to drop the column `adjustmentType` on the `CashAdjustment` table. All the data in the column will be lost.
  - You are about to drop the column `appliedAt` on the `CashAdjustment` table. All the data in the column will be lost.
  - You are about to drop the column `appliedById` on the `CashAdjustment` table. All the data in the column will be lost.
  - You are about to drop the column `milestoneId` on the `CashAdjustment` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[phaseId]` on the table `BOQ` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `createdById` to the `CashAdjustment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `CashAdjustment` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "CashAdjustment" DROP CONSTRAINT "CashAdjustment_appliedById_fkey";

-- DropIndex
DROP INDEX "CashAdjustment_adjustmentType_idx";

-- DropIndex
DROP INDEX "CashAdjustment_milestoneId_idx";

-- AlterTable
ALTER TABLE "BOQ" ADD COLUMN     "phaseId" TEXT;

-- AlterTable
ALTER TABLE "BOQRevision" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT;

-- AlterTable
ALTER TABLE "CashAdjustment" DROP COLUMN "adjustmentType",
DROP COLUMN "appliedAt",
DROP COLUMN "appliedById",
DROP COLUMN "milestoneId",
ADD COLUMN     "createdById" TEXT NOT NULL,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "type" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Milestone" ADD COLUMN     "phaseId" TEXT;

-- AlterTable
ALTER TABLE "PrivateCostEntry" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "vendor" TEXT,
ALTER COLUMN "incurredAt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Phase" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Phase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Phase_projectId_idx" ON "Phase"("projectId");

-- CreateIndex
CREATE INDEX "Phase_projectId_sortOrder_idx" ON "Phase"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "AuditLog_projectId_actionType_idx" ON "AuditLog"("projectId", "actionType");

-- CreateIndex
CREATE INDEX "AuditLog_projectId_createdAt_idx" ON "AuditLog"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BOQ_phaseId_key" ON "BOQ"("phaseId");

-- CreateIndex
CREATE INDEX "CashAdjustment_createdById_idx" ON "CashAdjustment"("createdById");

-- CreateIndex
CREATE INDEX "Evidence_milestoneId_status_idx" ON "Evidence"("milestoneId", "status");

-- CreateIndex
CREATE INDEX "Evidence_submittedById_status_idx" ON "Evidence"("submittedById", "status");

-- CreateIndex
CREATE INDEX "FollowUp_projectId_status_type_idx" ON "FollowUp"("projectId", "status", "type");

-- CreateIndex
CREATE INDEX "FollowUp_projectId_type_idx" ON "FollowUp"("projectId", "type");

-- CreateIndex
CREATE INDEX "Milestone_title_idx" ON "Milestone"("title");

-- CreateIndex
CREATE INDEX "Milestone_plannedEnd_idx" ON "Milestone"("plannedEnd");

-- CreateIndex
CREATE INDEX "Milestone_phaseId_idx" ON "Milestone"("phaseId");

-- CreateIndex
CREATE INDEX "Milestone_projectId_state_idx" ON "Milestone"("projectId", "state");

-- CreateIndex
CREATE INDEX "Milestone_vendorUserId_state_idx" ON "Milestone"("vendorUserId", "state");

-- CreateIndex
CREATE INDEX "PaymentEligibility_state_dueDate_idx" ON "PaymentEligibility"("state", "dueDate");

-- CreateIndex
CREATE INDEX "PrivateCostEntry_createdById_idx" ON "PrivateCostEntry"("createdById");

-- CreateIndex
CREATE INDEX "ProjectRole_projectId_role_idx" ON "ProjectRole"("projectId", "role");

-- AddForeignKey
ALTER TABLE "BOQ" ADD CONSTRAINT "BOQ_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashAdjustment" ADD CONSTRAINT "CashAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Phase" ADD CONSTRAINT "Phase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
