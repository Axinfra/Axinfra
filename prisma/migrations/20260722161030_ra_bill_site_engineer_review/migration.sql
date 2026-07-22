-- AlterTable
ALTER TABLE "RABill" ADD COLUMN     "siteEngineerRemarks" TEXT,
ADD COLUMN     "siteEngineerReviewedAt" TIMESTAMP(3),
ADD COLUMN     "siteEngineerReviewedById" TEXT,
ADD COLUMN     "siteEngineerReviewedValue" DOUBLE PRECISION,
ADD COLUMN     "vendorAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "vendorAcceptedById" TEXT;

-- AddForeignKey
ALTER TABLE "RABill" ADD CONSTRAINT "RABill_siteEngineerReviewedById_fkey" FOREIGN KEY ("siteEngineerReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RABill" ADD CONSTRAINT "RABill_vendorAcceptedById_fkey" FOREIGN KEY ("vendorAcceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
