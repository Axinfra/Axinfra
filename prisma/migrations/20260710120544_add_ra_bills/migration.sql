-- CreateTable
CREATE TABLE "RABill" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "billNumber" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "submittedValue" DOUBLE PRECISION,
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "revisionRequestedAt" TIMESTAMP(3),
    "revisionRequestedById" TEXT,
    "revisionReason" TEXT,
    "certifiedAt" TIMESTAMP(3),
    "certifiedById" TEXT,
    "certifiedRemarks" TEXT,
    "approvedValue" DOUBLE PRECISION,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "deductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "releasedValue" DOUBLE PRECISION,
    "releasedAt" TIMESTAMP(3),
    "releasedById" TEXT,
    "paymentReference" TEXT,
    "storageKey" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "remarks" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RABill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RABillLineItem" (
    "id" TEXT NOT NULL,
    "raBillId" TEXT NOT NULL,
    "boqId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "contractedQty" DOUBLE PRECISION NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "previousCumulativeQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "thisBillQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "thisBillAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cumulativeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RABillLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RABill_projectId_idx" ON "RABill"("projectId");

-- CreateIndex
CREATE INDEX "RABill_projectId_status_idx" ON "RABill"("projectId", "status");

-- CreateIndex
CREATE INDEX "RABill_orderId_idx" ON "RABill"("orderId");

-- CreateIndex
CREATE INDEX "RABill_orderId_billNumber_idx" ON "RABill"("orderId", "billNumber");

-- CreateIndex
CREATE UNIQUE INDEX "RABill_orderId_billNumber_key" ON "RABill"("orderId", "billNumber");

-- CreateIndex
CREATE INDEX "RABillLineItem_raBillId_idx" ON "RABillLineItem"("raBillId");

-- CreateIndex
CREATE INDEX "RABillLineItem_boqId_idx" ON "RABillLineItem"("boqId");

-- AddForeignKey
ALTER TABLE "RABill" ADD CONSTRAINT "RABill_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RABill" ADD CONSTRAINT "RABill_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RABill" ADD CONSTRAINT "RABill_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RABill" ADD CONSTRAINT "RABill_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RABill" ADD CONSTRAINT "RABill_revisionRequestedById_fkey" FOREIGN KEY ("revisionRequestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RABill" ADD CONSTRAINT "RABill_certifiedById_fkey" FOREIGN KEY ("certifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RABill" ADD CONSTRAINT "RABill_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RABill" ADD CONSTRAINT "RABill_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RABillLineItem" ADD CONSTRAINT "RABillLineItem_raBillId_fkey" FOREIGN KEY ("raBillId") REFERENCES "RABill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RABillLineItem" ADD CONSTRAINT "RABillLineItem_boqId_fkey" FOREIGN KEY ("boqId") REFERENCES "BOQ"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
