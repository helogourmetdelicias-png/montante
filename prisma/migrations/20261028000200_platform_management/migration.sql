ALTER TABLE "Tenant" ADD COLUMN "billing_plan_override" TEXT;
CREATE TABLE "PlatformAudit" (
  "id" TEXT PRIMARY KEY, "actor_id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL,
  "action" TEXT NOT NULL, "details" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PlatformAudit_tenant_id_created_at_idx" ON "PlatformAudit"("tenant_id", "created_at");
ALTER TABLE "PlatformAudit" ENABLE ROW LEVEL SECURITY;
