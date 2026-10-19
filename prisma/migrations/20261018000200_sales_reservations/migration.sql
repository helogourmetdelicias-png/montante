-- Add per-tenant sequential sale numbers, request idempotency, and reservation expiry.
ALTER TABLE "Tenant"
ADD COLUMN "sales_sequence" INTEGER NOT NULL DEFAULT 0;

UPDATE "Tenant" AS tenant
SET "sales_sequence" = COALESCE(
  (SELECT MAX(sale_number) FROM "Sale" WHERE tenant_id = tenant.id),
  0
);

ALTER TABLE "Sale"
ADD COLUMN "idempotency_key" TEXT,
ADD COLUMN "request_hash" CHAR(64),
ADD COLUMN "expires_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "Sale_tenant_id_idempotency_key_key"
ON "Sale"("tenant_id", "idempotency_key");

CREATE INDEX "Sale_tenant_id_status_expires_at_idx"
ON "Sale"("tenant_id", "status", "expires_at");
