-- AlterTable
ALTER TABLE "DirectOrder" ADD COLUMN     "billedValue" DOUBLE PRECISION,
ADD COLUMN     "billGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "billGeneratedById" TEXT;

-- AddForeignKey
ALTER TABLE "DirectOrder" ADD CONSTRAINT "DirectOrder_billGeneratedById_fkey" FOREIGN KEY ("billGeneratedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
