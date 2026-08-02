-- CreateTable
CREATE TABLE "DirectOrder" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "doNumber" TEXT NOT NULL,
    "vendorUserId" TEXT NOT NULL,
    "itemDescription" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ORDERED',
    "remarks" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DirectOrder_projectId_idx" ON "DirectOrder"("projectId");

-- CreateIndex
CREATE INDEX "DirectOrder_vendorUserId_idx" ON "DirectOrder"("vendorUserId");

-- CreateIndex
CREATE INDEX "DirectOrder_projectId_status_idx" ON "DirectOrder"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DirectOrder_projectId_doNumber_key" ON "DirectOrder"("projectId", "doNumber");

-- AddForeignKey
ALTER TABLE "DirectOrder" ADD CONSTRAINT "DirectOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectOrder" ADD CONSTRAINT "DirectOrder_vendorUserId_fkey" FOREIGN KEY ("vendorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectOrder" ADD CONSTRAINT "DirectOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
