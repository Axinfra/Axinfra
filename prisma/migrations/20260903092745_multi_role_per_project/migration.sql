-- DropIndex
DROP INDEX "ProjectRole_projectId_userId_key";

-- CreateIndex
CREATE INDEX "ProjectRole_projectId_userId_idx" ON "ProjectRole"("projectId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectRole_projectId_userId_role_key" ON "ProjectRole"("projectId", "userId", "role");

