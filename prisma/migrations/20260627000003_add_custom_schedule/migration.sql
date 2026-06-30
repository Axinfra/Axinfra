-- Custom Schedule tables (additive, production-safe)

CREATE TABLE IF NOT EXISTS "CustomSchedule" (
  "id"          TEXT NOT NULL,
  "projectId"   TEXT NOT NULL,
  "isPreferred" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomSchedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomSchedule_projectId_key" ON "CustomSchedule"("projectId");
CREATE INDEX        IF NOT EXISTS "CustomSchedule_projectId_idx" ON "CustomSchedule"("projectId");

ALTER TABLE "CustomSchedule"
  ADD CONSTRAINT "CustomSchedule_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomSchedule"
  ADD CONSTRAINT "CustomSchedule_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "CustomSchedulePhase" (
  "id"               TEXT NOT NULL,
  "customScheduleId" TEXT NOT NULL,
  "name"             TEXT NOT NULL,
  "plannedStart"     TIMESTAMP(3) NOT NULL,
  "plannedEnd"       TIMESTAMP(3) NOT NULL,
  "sortOrder"        INTEGER NOT NULL DEFAULT 0,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomSchedulePhase_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CustomSchedulePhase_customScheduleId_idx"           ON "CustomSchedulePhase"("customScheduleId");
CREATE INDEX IF NOT EXISTS "CustomSchedulePhase_customScheduleId_sortOrder_idx" ON "CustomSchedulePhase"("customScheduleId", "sortOrder");

ALTER TABLE "CustomSchedulePhase"
  ADD CONSTRAINT "CustomSchedulePhase_customScheduleId_fkey"
  FOREIGN KEY ("customScheduleId") REFERENCES "CustomSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "CustomScheduleMilestoneLink" (
  "id"                    TEXT NOT NULL,
  "customSchedulePhaseId" TEXT NOT NULL,
  "milestoneId"           TEXT NOT NULL,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomScheduleMilestoneLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomScheduleMilestoneLink_customSchedulePhaseId_milestoneId_key"
  ON "CustomScheduleMilestoneLink"("customSchedulePhaseId", "milestoneId");
CREATE INDEX IF NOT EXISTS "CustomScheduleMilestoneLink_customSchedulePhaseId_idx" ON "CustomScheduleMilestoneLink"("customSchedulePhaseId");
CREATE INDEX IF NOT EXISTS "CustomScheduleMilestoneLink_milestoneId_idx"           ON "CustomScheduleMilestoneLink"("milestoneId");

ALTER TABLE "CustomScheduleMilestoneLink"
  ADD CONSTRAINT "CustomScheduleMilestoneLink_customSchedulePhaseId_fkey"
  FOREIGN KEY ("customSchedulePhaseId") REFERENCES "CustomSchedulePhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomScheduleMilestoneLink"
  ADD CONSTRAINT "CustomScheduleMilestoneLink_milestoneId_fkey"
  FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;
