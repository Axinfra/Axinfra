-- Migration: execution_intelligence_phase1
-- Adds schedule intelligence fields to Milestone, plus MilestoneDependency and ProjectScheduleConfig tables.
-- All additions are backward-compatible: new columns have safe defaults or are nullable.

-- Add schedule intelligence columns to Milestone (safe defaults / nullable)
ALTER TABLE "Milestone" ADD COLUMN IF NOT EXISTS "baselinePlannedEnd"   TIMESTAMP(3);
ALTER TABLE "Milestone" ADD COLUMN IF NOT EXISTS "baselinePlannedStart" TIMESTAMP(3);
ALTER TABLE "Milestone" ADD COLUMN IF NOT EXISTS "sortOrder"            INTEGER NOT NULL DEFAULT 0;

-- Backfill baselinePlannedEnd from existing plannedEnd (one-time snapshot)
UPDATE "Milestone" SET "baselinePlannedEnd" = "plannedEnd" WHERE "baselinePlannedEnd" IS NULL AND "plannedEnd" IS NOT NULL;
UPDATE "Milestone" SET "baselinePlannedStart" = "plannedStart" WHERE "baselinePlannedStart" IS NULL AND "plannedStart" IS NOT NULL;

-- MilestoneDependency: directed edges for CPM / Gantt dependency arrows
CREATE TABLE IF NOT EXISTS "MilestoneDependency" (
    "id"             TEXT NOT NULL,
    "predecessorId"  TEXT NOT NULL,
    "successorId"    TEXT NOT NULL,
    "dependencyType" TEXT NOT NULL DEFAULT 'FS',
    "lagDays"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MilestoneDependency_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: only one dependency edge per pair
ALTER TABLE "MilestoneDependency" DROP CONSTRAINT IF EXISTS "MilestoneDependency_predecessorId_successorId_key";
ALTER TABLE "MilestoneDependency" ADD CONSTRAINT  "MilestoneDependency_predecessorId_successorId_key" UNIQUE ("predecessorId","successorId");

-- Foreign keys for MilestoneDependency
ALTER TABLE "MilestoneDependency" DROP CONSTRAINT IF EXISTS "MilestoneDependency_predecessorId_fkey";
ALTER TABLE "MilestoneDependency" ADD  CONSTRAINT "MilestoneDependency_predecessorId_fkey"
    FOREIGN KEY ("predecessorId") REFERENCES "Milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MilestoneDependency" DROP CONSTRAINT IF EXISTS "MilestoneDependency_successorId_fkey";
ALTER TABLE "MilestoneDependency" ADD  CONSTRAINT "MilestoneDependency_successorId_fkey"
    FOREIGN KEY ("successorId") REFERENCES "Milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "MilestoneDependency_predecessorId_idx" ON "MilestoneDependency"("predecessorId");
CREATE INDEX IF NOT EXISTS "MilestoneDependency_successorId_idx"   ON "MilestoneDependency"("successorId");

-- ProjectScheduleConfig: per-project schedule settings
CREATE TABLE IF NOT EXISTS "ProjectScheduleConfig" (
    "id"                    TEXT NOT NULL,
    "projectId"             TEXT NOT NULL,
    "projectStartDate"      TIMESTAMP(3),
    "dailyOverheadCost"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    "penaltyRatePerDay"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    "opportunityCostFactor" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectScheduleConfig_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProjectScheduleConfig" DROP CONSTRAINT IF EXISTS "ProjectScheduleConfig_projectId_key";
ALTER TABLE "ProjectScheduleConfig" ADD  CONSTRAINT "ProjectScheduleConfig_projectId_key" UNIQUE ("projectId");

ALTER TABLE "ProjectScheduleConfig" DROP CONSTRAINT IF EXISTS "ProjectScheduleConfig_projectId_fkey";
ALTER TABLE "ProjectScheduleConfig" ADD  CONSTRAINT "ProjectScheduleConfig_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
