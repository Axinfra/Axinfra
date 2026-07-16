-- DropForeignKey
ALTER TABLE "MicrosoftConnection" DROP CONSTRAINT "MicrosoftConnection_userId_fkey";

-- DropForeignKey
ALTER TABLE "MicrosoftSyncLog" DROP CONSTRAINT "MicrosoftSyncLog_projectMicrosoftSyncId_fkey";

-- DropForeignKey
ALTER TABLE "MicrosoftSyncLog" DROP CONSTRAINT "MicrosoftSyncLog_triggeredByUserId_fkey";

-- DropForeignKey
ALTER TABLE "MicrosoftSyncMapping" DROP CONSTRAINT "MicrosoftSyncMapping_projectMicrosoftSyncId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectMicrosoftSync" DROP CONSTRAINT "ProjectMicrosoftSync_connectedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectMicrosoftSync" DROP CONSTRAINT "ProjectMicrosoftSync_projectId_fkey";

-- AlterTable
ALTER TABLE "Milestone" DROP COLUMN "assignedEngineerEmail",
DROP COLUMN "assignedEngineerName",
DROP COLUMN "durationDays",
DROP COLUMN "externalSyncedAt",
DROP COLUMN "priority",
DROP COLUMN "progressPercent",
DROP COLUMN "remarks";

-- DropTable
DROP TABLE "MicrosoftConnection";

-- DropTable
DROP TABLE "MicrosoftSyncLog";

-- DropTable
DROP TABLE "MicrosoftSyncMapping";

-- DropTable
DROP TABLE "ProjectMicrosoftSync";

