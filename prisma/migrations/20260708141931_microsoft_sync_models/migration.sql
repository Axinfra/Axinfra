-- AlterTable
ALTER TABLE "Milestone" ADD COLUMN     "assignedEngineerEmail" TEXT,
ADD COLUMN     "assignedEngineerName" TEXT,
ADD COLUMN     "durationDays" DOUBLE PRECISION,
ADD COLUMN     "externalSyncedAt" TIMESTAMP(3),
ADD COLUMN     "priority" TEXT,
ADD COLUMN     "progressPercent" DOUBLE PRECISION,
ADD COLUMN     "remarks" TEXT;

-- CreateTable
CREATE TABLE "MicrosoftConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "microsoftUserId" TEXT NOT NULL,
    "microsoftEmail" TEXT NOT NULL,
    "tenantId" TEXT,
    "encryptedAccessToken" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "grantedScopes" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRefreshedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MicrosoftConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMicrosoftSync" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "connectedByUserId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalPlanId" TEXT NOT NULL,
    "externalPlanName" TEXT NOT NULL,
    "externalGroupId" TEXT,
    "dataverseOrgUrl" TEXT,
    "syncDirection" TEXT NOT NULL DEFAULT 'BIDIRECTIONAL',
    "autoSyncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT NOT NULL DEFAULT 'NEVER_SYNCED',
    "lastSyncError" TEXT,
    "webhookSubscriptionId" TEXT,
    "webhookExpiresAt" TIMESTAMP(3),
    "webhookClientState" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectMicrosoftSync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MicrosoftSyncMapping" (
    "id" TEXT NOT NULL,
    "projectMicrosoftSyncId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "internalId" TEXT NOT NULL,
    "etag" TEXT,
    "lastExternalHash" TEXT,
    "lastInternalHash" TEXT,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MicrosoftSyncMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MicrosoftSyncLog" (
    "id" TEXT NOT NULL,
    "projectMicrosoftSyncId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "triggeredByUserId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "phasesCreated" INTEGER NOT NULL DEFAULT 0,
    "phasesUpdated" INTEGER NOT NULL DEFAULT 0,
    "milestonesCreated" INTEGER NOT NULL DEFAULT 0,
    "milestonesUpdated" INTEGER NOT NULL DEFAULT 0,
    "dependenciesSynced" INTEGER NOT NULL DEFAULT 0,
    "errors" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MicrosoftSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MicrosoftConnection_userId_key" ON "MicrosoftConnection"("userId");

-- CreateIndex
CREATE INDEX "MicrosoftConnection_userId_idx" ON "MicrosoftConnection"("userId");

-- CreateIndex
CREATE INDEX "MicrosoftConnection_microsoftUserId_idx" ON "MicrosoftConnection"("microsoftUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMicrosoftSync_projectId_key" ON "ProjectMicrosoftSync"("projectId");

-- CreateIndex
CREATE INDEX "ProjectMicrosoftSync_platform_idx" ON "ProjectMicrosoftSync"("platform");

-- CreateIndex
CREATE INDEX "ProjectMicrosoftSync_lastSyncStatus_idx" ON "ProjectMicrosoftSync"("lastSyncStatus");

-- CreateIndex
CREATE INDEX "MicrosoftSyncMapping_externalId_idx" ON "MicrosoftSyncMapping"("externalId");

-- CreateIndex
CREATE INDEX "MicrosoftSyncMapping_internalId_idx" ON "MicrosoftSyncMapping"("internalId");

-- CreateIndex
CREATE UNIQUE INDEX "MicrosoftSyncMapping_projectMicrosoftSyncId_entityType_exte_key" ON "MicrosoftSyncMapping"("projectMicrosoftSyncId", "entityType", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "MicrosoftSyncMapping_projectMicrosoftSyncId_entityType_inte_key" ON "MicrosoftSyncMapping"("projectMicrosoftSyncId", "entityType", "internalId");

-- CreateIndex
CREATE INDEX "MicrosoftSyncLog_projectMicrosoftSyncId_startedAt_idx" ON "MicrosoftSyncLog"("projectMicrosoftSyncId", "startedAt");

-- CreateIndex
CREATE INDEX "MicrosoftSyncLog_status_idx" ON "MicrosoftSyncLog"("status");

-- AddForeignKey
ALTER TABLE "MicrosoftConnection" ADD CONSTRAINT "MicrosoftConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMicrosoftSync" ADD CONSTRAINT "ProjectMicrosoftSync_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMicrosoftSync" ADD CONSTRAINT "ProjectMicrosoftSync_connectedByUserId_fkey" FOREIGN KEY ("connectedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicrosoftSyncMapping" ADD CONSTRAINT "MicrosoftSyncMapping_projectMicrosoftSyncId_fkey" FOREIGN KEY ("projectMicrosoftSyncId") REFERENCES "ProjectMicrosoftSync"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicrosoftSyncLog" ADD CONSTRAINT "MicrosoftSyncLog_projectMicrosoftSyncId_fkey" FOREIGN KEY ("projectMicrosoftSyncId") REFERENCES "ProjectMicrosoftSync"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicrosoftSyncLog" ADD CONSTRAINT "MicrosoftSyncLog_triggeredByUserId_fkey" FOREIGN KEY ("triggeredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
