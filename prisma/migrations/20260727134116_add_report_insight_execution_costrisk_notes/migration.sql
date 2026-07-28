-- AlterTable
ALTER TABLE "ReportInsight" ADD COLUMN     "costRiskNote" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "executionNote" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "boqNote" DROP DEFAULT,
ALTER COLUMN "overviewNote" DROP DEFAULT;
