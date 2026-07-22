-- AlterTable
ALTER TABLE "DailyProgressReport" ADD COLUMN     "criticalIssues" TEXT;

-- CreateTable
CREATE TABLE "DPRPhoto" (
    "id" TEXT NOT NULL,
    "dprId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "filePath" TEXT NOT NULL DEFAULT '',
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "remarks" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DPRPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DPRPhoto_dprId_sortOrder_idx" ON "DPRPhoto"("dprId", "sortOrder");

-- AddForeignKey
ALTER TABLE "DPRPhoto" ADD CONSTRAINT "DPRPhoto_dprId_fkey" FOREIGN KEY ("dprId") REFERENCES "DailyProgressReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
