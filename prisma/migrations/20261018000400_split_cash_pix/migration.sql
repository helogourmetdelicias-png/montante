-- Adds auditable cash portions to mixed Pix/cash sales.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CASH';
ALTER TYPE "PaymentChannel" ADD VALUE IF NOT EXISTS 'IN_PERSON';

ALTER TABLE "PaymentAttempt"
  ADD COLUMN "amount_received" DECIMAL(10, 2),
  ADD COLUMN "change_amount" DECIMAL(10, 2);
