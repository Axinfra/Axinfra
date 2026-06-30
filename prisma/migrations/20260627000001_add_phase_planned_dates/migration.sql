-- AddColumn: Phase.plannedStart (nullable DateTime)
-- AddColumn: Phase.plannedEnd (nullable DateTime)
-- Safe additive migration — no existing data is modified.

ALTER TABLE "Phase" ADD COLUMN IF NOT EXISTS "plannedStart" TIMESTAMP(3);
ALTER TABLE "Phase" ADD COLUMN IF NOT EXISTS "plannedEnd"   TIMESTAMP(3);
