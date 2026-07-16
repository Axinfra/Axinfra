-- Rename BOQ's "Phase" foreign key to "Order" — scoped to the BOQ module only.
-- The underlying Phase table/model is unchanged and still used by Milestone/Schedule.
ALTER TABLE "BOQ" RENAME COLUMN "phaseId" TO "orderId";
ALTER INDEX "BOQ_phaseId_key" RENAME TO "BOQ_orderId_key";
ALTER TABLE "BOQ" RENAME CONSTRAINT "BOQ_phaseId_fkey" TO "BOQ_orderId_fkey";
