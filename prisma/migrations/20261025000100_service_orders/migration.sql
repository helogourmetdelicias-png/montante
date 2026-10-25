-- CreateEnum
CREATE TYPE "ServiceOrderStatus" AS ENUM ('PENDING_APPROVAL', 'IN_PROGRESS', 'READY', 'COMPLETED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BusinessNiche" ADD VALUE 'PHONE_REPAIR';
ALTER TYPE "BusinessNiche" ADD VALUE 'IT_SUPPORT';

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "service_sequence" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "service_order_id" TEXT;

-- CreateTable
CREATE TABLE "ServiceOrder" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "client_name" TEXT NOT NULL,
    "client_phone" TEXT NOT NULL,
    "device_type" TEXT NOT NULL,
    "device_brand_model" TEXT NOT NULL,
    "serial_number_imei" TEXT,
    "reported_defect" TEXT NOT NULL,
    "aesthetic_condition" TEXT NOT NULL,
    "device_password_encrypted" TEXT,
    "status" "ServiceOrderStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "parts_total" DECIMAL(10,2) NOT NULL,
    "labor_total" DECIMAL(10,2) NOT NULL,
    "grand_total" DECIMAL(10,2) NOT NULL,
    "photo_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "ServiceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceOrderPart" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "service_order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "name_snapshot" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "total_price" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "ServiceOrderPart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceOrder_tenant_id_status_created_at_idx" ON "ServiceOrder"("tenant_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceOrder_id_tenant_id_key" ON "ServiceOrder"("id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceOrder_tenant_id_number_key" ON "ServiceOrder"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "ServiceOrderPart_tenant_id_idx" ON "ServiceOrderPart"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceOrderPart_service_order_id_product_id_key" ON "ServiceOrderPart"("service_order_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "Product_id_tenant_id_key" ON "Product"("id", "tenant_id");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_service_order_id_tenant_id_fkey" FOREIGN KEY ("service_order_id", "tenant_id") REFERENCES "ServiceOrder"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrderPart" ADD CONSTRAINT "ServiceOrderPart_service_order_id_tenant_id_fkey" FOREIGN KEY ("service_order_id", "tenant_id") REFERENCES "ServiceOrder"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrderPart" ADD CONSTRAINT "ServiceOrderPart_product_id_tenant_id_fkey" FOREIGN KEY ("product_id", "tenant_id") REFERENCES "Product"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Monetary invariants and a single active checkout per service order.
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_totals_check" CHECK ("parts_total" >= 0 AND "labor_total" >= 0 AND "grand_total" = "parts_total" + "labor_total");
ALTER TABLE "ServiceOrderPart" ADD CONSTRAINT "ServiceOrderPart_amounts_check" CHECK ("quantity" > 0 AND "unit_price" >= 0 AND "total_price" = round("quantity" * "unit_price", 2));
CREATE UNIQUE INDEX "Sale_one_active_service_order" ON "Sale"("service_order_id") WHERE "service_order_id" IS NOT NULL AND "status" <> 'cancelled';
