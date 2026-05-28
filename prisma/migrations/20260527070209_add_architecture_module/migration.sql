-- CreateTable
CREATE TABLE "DrawingSet" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "requestedById" TEXT,
    "requestedAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paymentReleasedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DrawingSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrawingRow" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "setId" TEXT,
    "serialNo" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "floor" TEXT NOT NULL DEFAULT 'ALL_FLOORS',
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DrawingRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrawingVersion" (
    "id" TEXT NOT NULL,
    "drawingRowId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "uploadType" TEXT NOT NULL DEFAULT 'PDF',
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT,
    "fileSizeKb" INTEGER,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DrawingVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetRequest" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "SetRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DrawingSet_projectId_idx" ON "DrawingSet"("projectId");

-- CreateIndex
CREATE INDEX "DrawingSet_createdById_idx" ON "DrawingSet"("createdById");

-- CreateIndex
CREATE INDEX "DrawingSet_projectId_status_idx" ON "DrawingSet"("projectId", "status");

-- CreateIndex
CREATE INDEX "DrawingRow_projectId_idx" ON "DrawingRow"("projectId");

-- CreateIndex
CREATE INDEX "DrawingRow_setId_idx" ON "DrawingRow"("setId");

-- CreateIndex
CREATE INDEX "DrawingRow_projectId_status_idx" ON "DrawingRow"("projectId", "status");

-- CreateIndex
CREATE INDEX "DrawingRow_projectId_serialNo_idx" ON "DrawingRow"("projectId", "serialNo");

-- CreateIndex
CREATE INDEX "DrawingVersion_drawingRowId_idx" ON "DrawingVersion"("drawingRowId");

-- CreateIndex
CREATE INDEX "DrawingVersion_uploadedById_idx" ON "DrawingVersion"("uploadedById");

-- CreateIndex
CREATE INDEX "DrawingVersion_drawingRowId_isCurrent_idx" ON "DrawingVersion"("drawingRowId", "isCurrent");

-- CreateIndex
CREATE INDEX "DrawingVersion_drawingRowId_versionNumber_idx" ON "DrawingVersion"("drawingRowId", "versionNumber");

-- CreateIndex
CREATE INDEX "SetRequest_setId_idx" ON "SetRequest"("setId");

-- CreateIndex
CREATE INDEX "SetRequest_projectId_idx" ON "SetRequest"("projectId");

-- AddForeignKey
ALTER TABLE "DrawingSet" ADD CONSTRAINT "DrawingSet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingSet" ADD CONSTRAINT "DrawingSet_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingSet" ADD CONSTRAINT "DrawingSet_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingSet" ADD CONSTRAINT "DrawingSet_paymentReleasedBy_fkey" FOREIGN KEY ("paymentReleasedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingRow" ADD CONSTRAINT "DrawingRow_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingRow" ADD CONSTRAINT "DrawingRow_setId_fkey" FOREIGN KEY ("setId") REFERENCES "DrawingSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingRow" ADD CONSTRAINT "DrawingRow_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingVersion" ADD CONSTRAINT "DrawingVersion_drawingRowId_fkey" FOREIGN KEY ("drawingRowId") REFERENCES "DrawingRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingVersion" ADD CONSTRAINT "DrawingVersion_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingVersion" ADD CONSTRAINT "DrawingVersion_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetRequest" ADD CONSTRAINT "SetRequest_setId_fkey" FOREIGN KEY ("setId") REFERENCES "DrawingSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetRequest" ADD CONSTRAINT "SetRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetRequest" ADD CONSTRAINT "SetRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
