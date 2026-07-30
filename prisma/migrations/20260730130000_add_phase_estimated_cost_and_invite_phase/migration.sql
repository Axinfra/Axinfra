-- AlterTable
ALTER TABLE "Phase" ADD COLUMN     "estimatedCost" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "ProjectInvite" ADD COLUMN     "phaseId" TEXT;

-- CreateIndex
CREATE INDEX "ProjectInvite_phaseId_idx" ON "ProjectInvite"("phaseId");

-- AddForeignKey
ALTER TABLE "ProjectInvite" ADD CONSTRAINT "ProjectInvite_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
