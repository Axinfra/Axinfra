/*
  Warnings:

  - The `status` column on the `BOQ` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `Evidence` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `FollowUp` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `paymentModel` column on the `Milestone` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `state` column on the `Milestone` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `fromState` column on the `MilestoneStateTransition` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `Project` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the `PayableItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PaymentMark` table. If the table is not empty, all the data it contains will be lost.
  - Changed the type of `role` on the `AuditLog` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `type` on the `FollowUp` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `toState` on the `MilestoneStateTransition` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `role` on the `MilestoneStateTransition` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `role` on the `ProjectRole` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "PayableItem" DROP CONSTRAINT "PayableItem_milestoneId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentMark" DROP CONSTRAINT "PaymentMark_actorId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentMark" DROP CONSTRAINT "PaymentMark_payableItemId_fkey";

-- AlterTable
ALTER TABLE "AuditLog" DROP COLUMN "role",
ADD COLUMN     "role" TEXT NOT NULL,
ALTER COLUMN "beforeJson" SET DATA TYPE TEXT,
ALTER COLUMN "afterJson" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "BOQ" DROP COLUMN "status",
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "BOQRevision" ALTER COLUMN "changesJson" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "CustomView" ALTER COLUMN "config" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "Evidence" DROP COLUMN "status",
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'SUBMITTED';

-- AlterTable
ALTER TABLE "EvidenceFile" ADD COLUMN     "filePath" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "FollowUp" DROP COLUMN "type",
ADD COLUMN     "type" TEXT NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'OPEN';

-- AlterTable
ALTER TABLE "Milestone" ADD COLUMN     "advancePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "extraApprovedAt" TIMESTAMP(3),
ADD COLUMN     "extraApprovedById" TEXT,
ADD COLUMN     "isExtra" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
DROP COLUMN "paymentModel",
ADD COLUMN     "paymentModel" TEXT NOT NULL DEFAULT 'PROGRESS_BASED',
DROP COLUMN "state",
ADD COLUMN     "state" TEXT NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "MilestoneStateTransition" DROP COLUMN "fromState",
ADD COLUMN     "fromState" TEXT,
DROP COLUMN "toState",
ADD COLUMN     "toState" TEXT NOT NULL,
DROP COLUMN "role",
ADD COLUMN     "role" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "status",
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ONGOING',
ALTER COLUMN "metadata" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "ProjectRole" DROP COLUMN "role",
ADD COLUMN     "role" TEXT NOT NULL;

-- DropTable
DROP TABLE "PayableItem";

-- DropTable
DROP TABLE "PaymentMark";

-- DropEnum
DROP TYPE "BOQStatus";

-- DropEnum
DROP TYPE "EvidenceStatus";

-- DropEnum
DROP TYPE "FollowUpStatus";

-- DropEnum
DROP TYPE "FollowUpType";

-- DropEnum
DROP TYPE "MilestoneState";

-- DropEnum
DROP TYPE "PaymentMarkAction";

-- DropEnum
DROP TYPE "PaymentModel";

-- DropEnum
DROP TYPE "PaymentStatus";

-- DropEnum
DROP TYPE "ProjectStatus";

-- DropEnum
DROP TYPE "Role";

-- CreateTable
CREATE TABLE "EligibilityEvent" (
    "id" TEXT NOT NULL,
    "paymentEligibilityId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "fromState" TEXT,
    "toState" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "eligibleAmountBefore" DOUBLE PRECISION,
    "eligibleAmountAfter" DOUBLE PRECISION NOT NULL,
    "reasonCode" TEXT,
    "explanation" TEXT,
    "triggerEntityType" TEXT,
    "triggerEntityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EligibilityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEligibility" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "boqValueCompleted" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "eligibleAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "advanceAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remainingAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "blockedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "state" TEXT NOT NULL DEFAULT 'NOT_DUE',
    "dueDate" TIMESTAMP(3),
    "blockReasonCode" TEXT,
    "blockExplanation" TEXT,
    "blockedAt" TIMESTAMP(3),
    "blockedByActorId" TEXT,
    "markedPaidAt" TIMESTAMP(3),
    "markedPaidByActorId" TEXT,
    "paidExplanation" TEXT,
    "lastCalculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentEligibility_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EligibilityEvent_createdAt_idx" ON "EligibilityEvent"("createdAt");

-- CreateIndex
CREATE INDEX "EligibilityEvent_eventType_idx" ON "EligibilityEvent"("eventType");

-- CreateIndex
CREATE INDEX "EligibilityEvent_paymentEligibilityId_idx" ON "EligibilityEvent"("paymentEligibilityId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEligibility_milestoneId_key" ON "PaymentEligibility"("milestoneId");

-- CreateIndex
CREATE INDEX "PaymentEligibility_dueDate_idx" ON "PaymentEligibility"("dueDate");

-- CreateIndex
CREATE INDEX "PaymentEligibility_state_idx" ON "PaymentEligibility"("state");

-- CreateIndex
CREATE INDEX "Evidence_status_idx" ON "Evidence"("status");

-- CreateIndex
CREATE INDEX "FollowUp_status_idx" ON "FollowUp"("status");

-- CreateIndex
CREATE INDEX "FollowUp_type_idx" ON "FollowUp"("type");

-- CreateIndex
CREATE INDEX "Milestone_state_idx" ON "Milestone"("state");

-- AddForeignKey
ALTER TABLE "EligibilityEvent" ADD CONSTRAINT "EligibilityEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EligibilityEvent" ADD CONSTRAINT "EligibilityEvent_paymentEligibilityId_fkey" FOREIGN KEY ("paymentEligibilityId") REFERENCES "PaymentEligibility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEligibility" ADD CONSTRAINT "PaymentEligibility_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;
