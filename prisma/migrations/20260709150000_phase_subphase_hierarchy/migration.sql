-- AlterTable
ALTER TABLE "Phase" ADD COLUMN     "outlineLevel" INTEGER,
ADD COLUMN     "parentPhaseId" TEXT;

-- CreateIndex
CREATE INDEX "Phase_parentPhaseId_idx" ON "Phase"("parentPhaseId");

-- AddForeignKey
ALTER TABLE "Phase" ADD CONSTRAINT "Phase_parentPhaseId_fkey" FOREIGN KEY ("parentPhaseId") REFERENCES "Phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

