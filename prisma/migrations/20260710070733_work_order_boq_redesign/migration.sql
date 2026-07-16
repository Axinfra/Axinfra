-- DropIndex
DROP INDEX "BOQ_orderId_key";

-- AlterTable
ALTER TABLE "BOQ" ADD COLUMN     "boqNumber" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "plannedEnd" TIMESTAMP(3),
ADD COLUMN     "plannedStart" TIMESTAMP(3),
ADD COLUMN     "scope" TEXT,
ADD COLUMN     "workOrderStatus" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "address" TEXT,
ADD COLUMN     "companyName" TEXT,
ADD COLUMN     "contactPerson" TEXT,
ADD COLUMN     "gstNumber" TEXT,
ADD COLUMN     "mobile" TEXT;

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "currentRevisionNumber" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderRevision" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "plannedStart" TIMESTAMP(3),
    "plannedEnd" TIMESTAMP(3),
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "remarks" TEXT,
    "reason" TEXT,
    "changesJson" TEXT NOT NULL,
    "vendorAcceptanceStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_orderId_key" ON "WorkOrder"("orderId");

-- CreateIndex
CREATE INDEX "WorkOrder_projectId_idx" ON "WorkOrder"("projectId");

-- CreateIndex
CREATE INDEX "WorkOrderRevision_workOrderId_idx" ON "WorkOrderRevision"("workOrderId");

-- CreateIndex
CREATE INDEX "WorkOrderRevision_workOrderId_revisionNumber_idx" ON "WorkOrderRevision"("workOrderId", "revisionNumber");

-- CreateIndex
CREATE INDEX "BOQ_orderId_idx" ON "BOQ"("orderId");

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderRevision" ADD CONSTRAINT "WorkOrderRevision_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderRevision" ADD CONSTRAINT "WorkOrderRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderRevision" ADD CONSTRAINT "WorkOrderRevision_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
