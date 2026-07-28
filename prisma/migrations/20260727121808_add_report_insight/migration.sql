-- CreateTable
CREATE TABLE "ReportInsight" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "periodType" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "dataHash" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "recommendations" TEXT NOT NULL,
    "scheduleNote" TEXT NOT NULL,
    "financialNote" TEXT NOT NULL,
    "qualityNote" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportInsight_projectId_idx" ON "ReportInsight"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportInsight_projectId_periodType_periodStart_periodEnd_key" ON "ReportInsight"("projectId", "periodType", "periodStart", "periodEnd");

-- AddForeignKey
ALTER TABLE "ReportInsight" ADD CONSTRAINT "ReportInsight_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

