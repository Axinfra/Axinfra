-- AlterTable
ALTER TABLE "DrawingRow" ADD COLUMN     "dwgNumber" TEXT;

-- AlterTable
ALTER TABLE "DrawingVersion" ADD COLUMN     "sharedAt" TIMESTAMP(3),
ADD COLUMN     "sharedById" TEXT,
ADD COLUMN     "sharedWithRoles" TEXT;

-- AlterTable
ALTER TABLE "ProjectDocument" ADD COLUMN     "sharedAt" TIMESTAMP(3),
ADD COLUMN     "sharedById" TEXT,
ADD COLUMN     "sharedWithRoles" TEXT;

-- AddForeignKey
ALTER TABLE "DrawingVersion" ADD CONSTRAINT "DrawingVersion_sharedById_fkey" FOREIGN KEY ("sharedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocument" ADD CONSTRAINT "ProjectDocument_sharedById_fkey" FOREIGN KEY ("sharedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

