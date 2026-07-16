-- AlterTable
ALTER TABLE "Milestone" ADD COLUMN     "actualEnd" TIMESTAMP(3),
ADD COLUMN     "actualWorkHours" DOUBLE PRECISION,
ADD COLUMN     "durationDays" DOUBLE PRECISION,
ADD COLUMN     "isMsProjectMilestone" BOOLEAN,
ADD COLUMN     "outlineLevel" INTEGER,
ADD COLUMN     "percentComplete" DOUBLE PRECISION,
ADD COLUMN     "remainingWorkHours" DOUBLE PRECISION,
ADD COLUMN     "scheduleImportId" TEXT,
ADD COLUMN     "wbsCode" TEXT;

-- AlterTable
ALTER TABLE "Phase" ADD COLUMN     "scheduleImportId" TEXT;

-- CreateTable
CREATE TABLE "ScheduleImport" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sourceFormat" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "extractedDataJson" TEXT,
    "phasesFound" INTEGER NOT NULL DEFAULT 0,
    "milestonesFound" INTEGER NOT NULL DEFAULT 0,
    "dependenciesFound" INTEGER NOT NULL DEFAULT 0,
    "resourcesFound" INTEGER NOT NULL DEFAULT 0,
    "parsedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "scheduleImportId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MilestoneResourceAssignment" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "units" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "workHours" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MilestoneResourceAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleImport_projectId_createdAt_idx" ON "ScheduleImport"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Resource_projectId_idx" ON "Resource"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "MilestoneResourceAssignment_milestoneId_resourceId_key" ON "MilestoneResourceAssignment"("milestoneId", "resourceId");

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_scheduleImportId_fkey" FOREIGN KEY ("scheduleImportId") REFERENCES "ScheduleImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Phase" ADD CONSTRAINT "Phase_scheduleImportId_fkey" FOREIGN KEY ("scheduleImportId") REFERENCES "ScheduleImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleImport" ADD CONSTRAINT "ScheduleImport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleImport" ADD CONSTRAINT "ScheduleImport_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_scheduleImportId_fkey" FOREIGN KEY ("scheduleImportId") REFERENCES "ScheduleImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilestoneResourceAssignment" ADD CONSTRAINT "MilestoneResourceAssignment_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilestoneResourceAssignment" ADD CONSTRAINT "MilestoneResourceAssignment_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
