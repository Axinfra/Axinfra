-- AlterTable
ALTER TABLE "WorkOrderRevision" ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedById" TEXT,
ADD COLUMN     "vendorRemarks" TEXT;

-- AddForeignKey
ALTER TABLE "WorkOrderRevision" ADD CONSTRAINT "WorkOrderRevision_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
