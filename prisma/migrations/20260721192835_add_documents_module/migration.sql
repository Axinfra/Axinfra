-- CreateTable
CREATE TABLE "ProjectDocument" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProjectDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectDocumentFile" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectDocumentFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Checklist" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "docRefNo" TEXT NOT NULL,
    "referenceDrawingNo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "certificationRemarks" TEXT,
    "createdById" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3),
    "signedByActorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Checklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "result" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyProgressReport" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reportDate" TEXT NOT NULL,
    "periodFrom" TEXT,
    "periodTo" TEXT,
    "docRefNo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3),
    "signedByActorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyProgressReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DPRProcurementRow" (
    "id" TEXT NOT NULL,
    "dprId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "materialName" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL,
    "alreadyReceived" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receivedThisWeek" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cumulativeReceivedTillDate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "consumedTillDate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceAtSite" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "additionalRequirement" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DPRProcurementRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DPRManpowerRow" (
    "id" TEXT NOT NULL,
    "dprId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "vendorName" TEXT NOT NULL,
    "tradeName" TEXT NOT NULL,
    "actualCount" INTEGER NOT NULL DEFAULT 0,
    "plannedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DPRManpowerRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DPRHighlight" (
    "id" TEXT NOT NULL,
    "dprId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DPRHighlight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectDocument_projectId_category_createdAt_idx" ON "ProjectDocument"("projectId", "category", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectDocumentFile_documentId_idx" ON "ProjectDocumentFile"("documentId");

-- CreateIndex
CREATE INDEX "Checklist_projectId_status_idx" ON "Checklist"("projectId", "status");

-- CreateIndex
CREATE INDEX "Checklist_projectId_createdAt_idx" ON "Checklist"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Checklist_projectId_docRefNo_key" ON "Checklist"("projectId", "docRefNo");

-- CreateIndex
CREATE INDEX "ChecklistItem_checklistId_sortOrder_idx" ON "ChecklistItem"("checklistId", "sortOrder");

-- CreateIndex
CREATE INDEX "DailyProgressReport_projectId_status_idx" ON "DailyProgressReport"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DailyProgressReport_projectId_reportDate_key" ON "DailyProgressReport"("projectId", "reportDate");

-- CreateIndex
CREATE INDEX "DPRProcurementRow_dprId_sortOrder_idx" ON "DPRProcurementRow"("dprId", "sortOrder");

-- CreateIndex
CREATE INDEX "DPRManpowerRow_dprId_vendorName_idx" ON "DPRManpowerRow"("dprId", "vendorName");

-- CreateIndex
CREATE INDEX "DPRManpowerRow_dprId_sortOrder_idx" ON "DPRManpowerRow"("dprId", "sortOrder");

-- CreateIndex
CREATE INDEX "DPRHighlight_dprId_sortOrder_idx" ON "DPRHighlight"("dprId", "sortOrder");

-- AddForeignKey
ALTER TABLE "ProjectDocument" ADD CONSTRAINT "ProjectDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocument" ADD CONSTRAINT "ProjectDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentFile" ADD CONSTRAINT "ProjectDocumentFile_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ProjectDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checklist" ADD CONSTRAINT "Checklist_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checklist" ADD CONSTRAINT "Checklist_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checklist" ADD CONSTRAINT "Checklist_signedByActorId_fkey" FOREIGN KEY ("signedByActorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "Checklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyProgressReport" ADD CONSTRAINT "DailyProgressReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyProgressReport" ADD CONSTRAINT "DailyProgressReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyProgressReport" ADD CONSTRAINT "DailyProgressReport_signedByActorId_fkey" FOREIGN KEY ("signedByActorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DPRProcurementRow" ADD CONSTRAINT "DPRProcurementRow_dprId_fkey" FOREIGN KEY ("dprId") REFERENCES "DailyProgressReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DPRManpowerRow" ADD CONSTRAINT "DPRManpowerRow_dprId_fkey" FOREIGN KEY ("dprId") REFERENCES "DailyProgressReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DPRHighlight" ADD CONSTRAINT "DPRHighlight_dprId_fkey" FOREIGN KEY ("dprId") REFERENCES "DailyProgressReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
