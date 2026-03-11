-- CreateTable: VendorMetrics
CREATE TABLE "VendorMetrics" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "vendorUserId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "totalMilestones" INTEGER NOT NULL DEFAULT 0,
    "completedOnTime" INTEGER NOT NULL DEFAULT 0,
    "completedLate" INTEGER NOT NULL DEFAULT 0,
    "avgDelayDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qualityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "escalationCount" INTEGER NOT NULL DEFAULT 0,
    "totalValueDelivered" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalValuePaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ProjectMetrics
CREATE TABLE "ProjectMetrics" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "totalBudget" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "spentToDate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "earnedValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "plannedValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costVariance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scheduleVariance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cpi" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "spi" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "milestonesTotal" INTEGER NOT NULL DEFAULT 0,
    "milestonesComplete" INTEGER NOT NULL DEFAULT 0,
    "milestonesOverdue" INTEGER NOT NULL DEFAULT 0,
    "healthStatus" TEXT NOT NULL DEFAULT 'GREEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SystemEvent
CREATE TABLE "SystemEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "actorId" TEXT,
    "projectId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "message" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CashAdjustment
CREATE TABLE "CashAdjustment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "milestoneId" TEXT,
    "adjustmentType" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "appliedById" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PrivateCostEntry
CREATE TABLE "PrivateCostEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "incurredAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivateCostEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: VendorMetrics
CREATE INDEX "VendorMetrics_projectId_idx" ON "VendorMetrics"("projectId");
CREATE INDEX "VendorMetrics_vendorUserId_idx" ON "VendorMetrics"("vendorUserId");
CREATE UNIQUE INDEX "VendorMetrics_projectId_vendorUserId_period_key" ON "VendorMetrics"("projectId", "vendorUserId", "period");

-- CreateIndex: ProjectMetrics
CREATE INDEX "ProjectMetrics_projectId_idx" ON "ProjectMetrics"("projectId");
CREATE UNIQUE INDEX "ProjectMetrics_projectId_period_key" ON "ProjectMetrics"("projectId", "period");

-- CreateIndex: SystemEvent
CREATE INDEX "SystemEvent_eventType_idx" ON "SystemEvent"("eventType");
CREATE INDEX "SystemEvent_severity_idx" ON "SystemEvent"("severity");
CREATE INDEX "SystemEvent_actorId_idx" ON "SystemEvent"("actorId");
CREATE INDEX "SystemEvent_projectId_idx" ON "SystemEvent"("projectId");
CREATE INDEX "SystemEvent_createdAt_idx" ON "SystemEvent"("createdAt");

-- CreateIndex: CashAdjustment
CREATE INDEX "CashAdjustment_projectId_idx" ON "CashAdjustment"("projectId");
CREATE INDEX "CashAdjustment_milestoneId_idx" ON "CashAdjustment"("milestoneId");
CREATE INDEX "CashAdjustment_adjustmentType_idx" ON "CashAdjustment"("adjustmentType");

-- CreateIndex: PrivateCostEntry
CREATE INDEX "PrivateCostEntry_projectId_idx" ON "PrivateCostEntry"("projectId");
CREATE INDEX "PrivateCostEntry_category_idx" ON "PrivateCostEntry"("category");

-- AddForeignKey: VendorMetrics
ALTER TABLE "VendorMetrics" ADD CONSTRAINT "VendorMetrics_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorMetrics" ADD CONSTRAINT "VendorMetrics_vendorUserId_fkey" FOREIGN KEY ("vendorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: ProjectMetrics
ALTER TABLE "ProjectMetrics" ADD CONSTRAINT "ProjectMetrics_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: SystemEvent
ALTER TABLE "SystemEvent" ADD CONSTRAINT "SystemEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SystemEvent" ADD CONSTRAINT "SystemEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: CashAdjustment
ALTER TABLE "CashAdjustment" ADD CONSTRAINT "CashAdjustment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashAdjustment" ADD CONSTRAINT "CashAdjustment_appliedById_fkey" FOREIGN KEY ("appliedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: PrivateCostEntry
ALTER TABLE "PrivateCostEntry" ADD CONSTRAINT "PrivateCostEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrivateCostEntry" ADD CONSTRAINT "PrivateCostEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
