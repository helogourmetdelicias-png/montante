CREATE TABLE "Customer" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "document" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "zipCode" TEXT,
  "street" TEXT,
  "number" TEXT,
  "neighborhood" TEXT,
  "city" TEXT,
  "state" CHAR(2),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Customer_id_tenant_id_key" ON "Customer"("id", "tenant_id");
CREATE UNIQUE INDEX "Customer_tenant_id_document_key" ON "Customer"("tenant_id", "document");
CREATE INDEX "Customer_tenant_id_name_idx" ON "Customer"("tenant_id", "name");
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD COLUMN "customer_id" TEXT;
CREATE INDEX "Sale_customer_id_tenant_id_idx" ON "Sale"("customer_id", "tenant_id");
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customer_id_tenant_id_fkey" FOREIGN KEY ("customer_id", "tenant_id") REFERENCES "Customer"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
