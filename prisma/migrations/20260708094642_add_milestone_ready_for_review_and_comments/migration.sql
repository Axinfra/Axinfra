-- AlterTable: optional, non-blocking "ready for review" flag on Milestone
ALTER TABLE "Milestone" ADD COLUMN     "readyForReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "readyForReviewAt" TIMESTAMP(3);

-- CreateTable: PMC/Owner comments on a milestone (no state impact)
CREATE TABLE "MilestoneComment" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MilestoneComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MilestoneComment_milestoneId_idx" ON "MilestoneComment"("milestoneId");

-- CreateIndex
CREATE INDEX "MilestoneComment_milestoneId_createdAt_idx" ON "MilestoneComment"("milestoneId", "createdAt");

-- CreateIndex
CREATE INDEX "Milestone_projectId_readyForReview_idx" ON "Milestone"("projectId", "readyForReview");

-- AddForeignKey
ALTER TABLE "MilestoneComment" ADD CONSTRAINT "MilestoneComment_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilestoneComment" ADD CONSTRAINT "MilestoneComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
