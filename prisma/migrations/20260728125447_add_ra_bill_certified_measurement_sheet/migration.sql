-- AlterTable
ALTER TABLE "RABill" ADD COLUMN     "certifiedMeasurementSheetId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "RABill_certifiedMeasurementSheetId_key" ON "RABill"("certifiedMeasurementSheetId");

-- AddForeignKey
ALTER TABLE "RABill" ADD CONSTRAINT "RABill_certifiedMeasurementSheetId_fkey" FOREIGN KEY ("certifiedMeasurementSheetId") REFERENCES "RABillMeasurementSheet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
