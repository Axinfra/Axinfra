/*
  Warnings:

  - A unique constraint covering the columns `[googleId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "CustomSchedule" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "CustomSchedulePhase" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DrawingRow" ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paidById" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "googleId" TEXT,
ADD COLUMN     "preferredRole" TEXT,
ALTER COLUMN "hashedPassword" DROP NOT NULL;

-- CreateTable
CREATE TABLE "VendorRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL DEFAULT 'VENDOR',
    "category" TEXT NOT NULL DEFAULT 'REQUEST',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'RFI',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "dueDate" TIMESTAMP(3),
    "sendTo" TEXT NOT NULL DEFAULT 'PMC',
    "refNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "responseNote" TEXT,
    "respondedById" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectInvite" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorRequestFile" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorRequestFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorRequest_projectId_idx" ON "VendorRequest"("projectId");

-- CreateIndex
CREATE INDEX "VendorRequest_submittedById_idx" ON "VendorRequest"("submittedById");

-- CreateIndex
CREATE INDEX "VendorRequest_senderRole_idx" ON "VendorRequest"("senderRole");

-- CreateIndex
CREATE INDEX "VendorRequest_status_idx" ON "VendorRequest"("status");

-- CreateIndex
CREATE INDEX "VendorRequest_category_idx" ON "VendorRequest"("category");

-- CreateIndex
CREATE INDEX "VendorRequest_sendTo_idx" ON "VendorRequest"("sendTo");

-- CreateIndex
CREATE INDEX "VendorRequest_projectId_status_idx" ON "VendorRequest"("projectId", "status");

-- CreateIndex
CREATE INDEX "VendorRequest_projectId_category_idx" ON "VendorRequest"("projectId", "category");

-- CreateIndex
CREATE INDEX "VendorRequest_projectId_createdAt_idx" ON "VendorRequest"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "VendorRequest_projectId_sendTo_idx" ON "VendorRequest"("projectId", "sendTo");

-- CreateIndex
CREATE INDEX "VendorRequest_projectId_submittedById_idx" ON "VendorRequest"("projectId", "submittedById");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectInvite_token_key" ON "ProjectInvite"("token");

-- CreateIndex
CREATE INDEX "ProjectInvite_projectId_idx" ON "ProjectInvite"("projectId");

-- CreateIndex
CREATE INDEX "ProjectInvite_email_idx" ON "ProjectInvite"("email");

-- CreateIndex
CREATE INDEX "ProjectInvite_token_idx" ON "ProjectInvite"("token");

-- CreateIndex
CREATE INDEX "ProjectInvite_status_idx" ON "ProjectInvite"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectInvite_projectId_email_key" ON "ProjectInvite"("projectId", "email");

-- CreateIndex
CREATE INDEX "VendorRequestFile_requestId_idx" ON "VendorRequestFile"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- AddForeignKey
ALTER TABLE "CustomView" ADD CONSTRAINT "CustomView_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingRow" ADD CONSTRAINT "DrawingRow_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorRequest" ADD CONSTRAINT "VendorRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorRequest" ADD CONSTRAINT "VendorRequest_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorRequest" ADD CONSTRAINT "VendorRequest_respondedById_fkey" FOREIGN KEY ("respondedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectInvite" ADD CONSTRAINT "ProjectInvite_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectInvite" ADD CONSTRAINT "ProjectInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorRequestFile" ADD CONSTRAINT "VendorRequestFile_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "VendorRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorRequestFile" ADD CONSTRAINT "VendorRequestFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "CustomScheduleMilestoneLink_customSchedulePhaseId_milestoneId_k" RENAME TO "CustomScheduleMilestoneLink_customSchedulePhaseId_milestone_key";
