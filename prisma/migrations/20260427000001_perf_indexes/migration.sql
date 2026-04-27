-- Performance: backfill missing FK indexes + Milestone (projectId, createdAt) composite.
-- All non-blocking metadata adds; safe on existing data. IF NOT EXISTS guards make this idempotent.

CREATE INDEX IF NOT EXISTS "EligibilityEvent_actorId_idx" ON "EligibilityEvent"("actorId");
CREATE INDEX IF NOT EXISTS "FollowUp_resolvedById_idx" ON "FollowUp"("resolvedById");
CREATE INDEX IF NOT EXISTS "Milestone_extraApprovedById_idx" ON "Milestone"("extraApprovedById");
CREATE INDEX IF NOT EXISTS "Milestone_projectId_createdAt_idx" ON "Milestone"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "MilestoneStateTransition_actorId_idx" ON "MilestoneStateTransition"("actorId");
CREATE INDEX IF NOT EXISTS "Verification_verifiedById_idx" ON "Verification"("verifiedById");
