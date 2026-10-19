-- Keep the amount handed by the customer and the change given at the counter.
ALTER TABLE "Sale"
  ADD COLUMN "amount_received" DECIMAL(10, 2),
  ADD COLUMN "change_amount" DECIMAL(10, 2);
