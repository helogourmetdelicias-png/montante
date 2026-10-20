CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'OVERDUE');
CREATE TABLE "TenantSubscription" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL UNIQUE REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "trial_ends_at" TIMESTAMP(3) NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
  "next_billing_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "TenantSubscription_next_billing_at_idx" ON "TenantSubscription"("next_billing_at");
ALTER TABLE "BillingRecord"
  ADD COLUMN "cycle_start" TIMESTAMP(3), ADD COLUMN "cycle_end" TIMESTAMP(3),
  ADD COLUMN "billing_start" TIMESTAMP(3), ADD COLUMN "billing_end" TIMESTAMP(3),
  ADD COLUMN "due_at" TIMESTAMP(3), ADD COLUMN "external_payment_id" TEXT,
  ADD COLUMN "checkout_url" TEXT;
CREATE UNIQUE INDEX "BillingRecord_external_payment_id_key" ON "BillingRecord"("external_payment_id");
INSERT INTO "TenantSubscription" ("id", "tenant_id", "trial_ends_at", "next_billing_at", "status")
SELECT 'sub_' || "id", "id", "created_at" + interval '3 months', "created_at" + interval '3 months',
  CASE WHEN "created_at" + interval '3 months' > CURRENT_TIMESTAMP
    THEN 'TRIAL'::"SubscriptionStatus" ELSE 'ACTIVE'::"SubscriptionStatus" END
FROM "Tenant";
