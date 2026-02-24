-- AlterTable
ALTER TABLE "Milestone" ADD COLUMN     "vendorUserId" TEXT;

-- AlterTable
ALTER TABLE "ProjectScheduleConfig" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "Milestone_vendorUserId_idx" ON "Milestone"("vendorUserId");

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_vendorUserId_fkey" FOREIGN KEY ("vendorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
