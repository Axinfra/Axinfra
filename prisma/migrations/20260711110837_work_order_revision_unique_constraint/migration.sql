-- DropIndex
DROP INDEX "WorkOrderRevision_workOrderId_revisionNumber_idx";

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderRevision_workOrderId_revisionNumber_key" ON "WorkOrderRevision"("workOrderId", "revisionNumber");
