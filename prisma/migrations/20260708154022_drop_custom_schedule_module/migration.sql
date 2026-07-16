/*
  Warnings:

  - You are about to drop the `CustomSchedule` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CustomScheduleMilestoneLink` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CustomSchedulePhase` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "CustomSchedule" DROP CONSTRAINT "CustomSchedule_createdById_fkey";

-- DropForeignKey
ALTER TABLE "CustomSchedule" DROP CONSTRAINT "CustomSchedule_projectId_fkey";

-- DropForeignKey
ALTER TABLE "CustomScheduleMilestoneLink" DROP CONSTRAINT "CustomScheduleMilestoneLink_customSchedulePhaseId_fkey";

-- DropForeignKey
ALTER TABLE "CustomScheduleMilestoneLink" DROP CONSTRAINT "CustomScheduleMilestoneLink_milestoneId_fkey";

-- DropForeignKey
ALTER TABLE "CustomSchedulePhase" DROP CONSTRAINT "CustomSchedulePhase_customScheduleId_fkey";

-- DropTable
DROP TABLE "CustomSchedule";

-- DropTable
DROP TABLE "CustomScheduleMilestoneLink";

-- DropTable
DROP TABLE "CustomSchedulePhase";
