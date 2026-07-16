-- AlterTable
ALTER TABLE "Phase" ADD COLUMN     "description" TEXT,
ADD COLUMN     "vendorUserId" TEXT;

-- CreateIndex
CREATE INDEX "Phase_vendorUserId_idx" ON "Phase"("vendorUserId");

-- AddForeignKey
ALTER TABLE "Phase" ADD CONSTRAINT "Phase_vendorUserId_fkey" FOREIGN KEY ("vendorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
