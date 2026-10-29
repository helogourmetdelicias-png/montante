-- Preserve unreconciled days while allowing today's independent drawer.
-- Prisma DateTime columns contain UTC timestamps without a timezone.
DROP INDEX "CashRegisterSession_one_open_per_operator";
CREATE UNIQUE INDEX "CashRegisterSession_one_open_per_operator_day"
  ON "CashRegisterSession" ("tenant_id", "user_id", (("opened_at" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date))
  WHERE "status" = 'OPEN';

-- Cash belongs to the day it is received, even when a sale spans midnight.
-- Null keeps legacy receipts associated with their original session.
ALTER TABLE "PaymentAttempt" ADD COLUMN "cash_session_id" TEXT;
CREATE INDEX "PaymentAttempt_tenant_id_cash_session_id_idx" ON "PaymentAttempt"("tenant_id", "cash_session_id");
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_cash_session_id_tenant_id_fkey"
  FOREIGN KEY ("cash_session_id", "tenant_id") REFERENCES "CashRegisterSession"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
