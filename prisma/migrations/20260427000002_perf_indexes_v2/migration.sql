-- Performance indexes v2 — covers analysis (execution / financial / vendor / delay-risk),
-- BOQ list/items/revisions, and audit-log composite filtering.
--
-- All non-blocking metadata adds; safe on existing data. IF NOT EXISTS guards
-- make this migration idempotent.

-- Execution analysis: Milestone.transitions ORDER BY createdAt asc
-- (currently triggers a sort over MilestoneStateTransition rows per milestone)
CREATE INDEX IF NOT EXISTS "MilestoneStateTransition_milestoneId_createdAt_idx"
  ON "MilestoneStateTransition"("milestoneId", "createdAt");

-- Financial / vendor analysis: Milestone.verifications ORDER BY verifiedAt desc TAKE 1
-- (latest-verification-per-milestone pattern)
CREATE INDEX IF NOT EXISTS "Verification_milestoneId_verifiedAt_idx"
  ON "Verification"("milestoneId", "verifiedAt");

-- BOQ list: ORDER BY createdAt desc within a project
CREATE INDEX IF NOT EXISTS "BOQ_projectId_createdAt_idx"
  ON "BOQ"("projectId", "createdAt");

-- BOQ items: ORDER BY createdAt asc within a BOQ
CREATE INDEX IF NOT EXISTS "BOQItem_boqId_createdAt_idx"
  ON "BOQItem"("boqId", "createdAt");

-- BOQ revisions: ORDER BY revisionNumber desc within a BOQ
CREATE INDEX IF NOT EXISTS "BOQRevision_boqId_revisionNumber_idx"
  ON "BOQRevision"("boqId", "revisionNumber");

-- Audit-log filtered queries: WHERE projectId + actorId, ORDER BY createdAt desc
-- (the audit-log UI lets users filter by actor; this composite avoids re-sort)
CREATE INDEX IF NOT EXISTS "AuditLog_projectId_actorId_createdAt_idx"
  ON "AuditLog"("projectId", "actorId", "createdAt");
