-- AlterTable
ALTER TABLE "ReportInsight" ALTER COLUMN "costRiskNote" DROP DEFAULT,
ALTER COLUMN "executionNote" DROP DEFAULT;

-- CreateTable
CREATE TABLE "RABillMeasurementSheet" (
    "id" TEXT NOT NULL,
    "raBillId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "remarks" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT NOT NULL,

    CONSTRAINT "RABillMeasurementSheet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RABillMeasurementSheet_raBillId_idx" ON "RABillMeasurementSheet"("raBillId");

-- AddForeignKey
ALTER TABLE "RABillMeasurementSheet" ADD CONSTRAINT "RABillMeasurementSheet_raBillId_fkey" FOREIGN KEY ("raBillId") REFERENCES "RABill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RABillMeasurementSheet" ADD CONSTRAINT "RABillMeasurementSheet_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

