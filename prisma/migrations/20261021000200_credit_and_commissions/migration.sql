-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "brand_snapshot" TEXT,
ADD COLUMN     "catalog_snapshot" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "category_snapshot" TEXT,
ADD COLUMN     "commission_rate" DECIMAL(5,2);

-- CreateTable
CREATE TABLE "CreditSale" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditPayment" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "credit_sale_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandCommission" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "brand_key" TEXT NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "BrandCommission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditSale_sale_id_key" ON "CreditSale"("sale_id");

-- CreateIndex
CREATE INDEX "CreditSale_tenant_id_customer_id_created_at_idx" ON "CreditSale"("tenant_id", "customer_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "CreditSale_sale_id_tenant_id_key" ON "CreditSale"("sale_id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "CreditSale_id_tenant_id_key" ON "CreditSale"("id", "tenant_id");

-- CreateIndex
CREATE INDEX "CreditPayment_tenant_id_credit_sale_id_created_at_idx" ON "CreditPayment"("tenant_id", "credit_sale_id", "created_at");

-- CreateIndex
CREATE INDEX "CreditPayment_tenant_id_session_id_method_idx" ON "CreditPayment"("tenant_id", "session_id", "method");

-- CreateIndex
CREATE UNIQUE INDEX "CreditPayment_tenant_id_idempotency_key_key" ON "CreditPayment"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "BrandCommission_tenant_id_brand_key_key" ON "BrandCommission"("tenant_id", "brand_key");

-- AddForeignKey
ALTER TABLE "CreditSale" ADD CONSTRAINT "CreditSale_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditSale" ADD CONSTRAINT "CreditSale_sale_id_tenant_id_fkey" FOREIGN KEY ("sale_id", "tenant_id") REFERENCES "Sale"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditSale" ADD CONSTRAINT "CreditSale_customer_id_tenant_id_fkey" FOREIGN KEY ("customer_id", "tenant_id") REFERENCES "Customer"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditPayment" ADD CONSTRAINT "CreditPayment_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditPayment" ADD CONSTRAINT "CreditPayment_credit_sale_id_tenant_id_fkey" FOREIGN KEY ("credit_sale_id", "tenant_id") REFERENCES "CreditSale"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditPayment" ADD CONSTRAINT "CreditPayment_user_id_tenant_id_fkey" FOREIGN KEY ("user_id", "tenant_id") REFERENCES "User"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditPayment" ADD CONSTRAINT "CreditPayment_session_id_tenant_id_fkey" FOREIGN KEY ("session_id", "tenant_id") REFERENCES "CashRegisterSession"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandCommission" ADD CONSTRAINT "BrandCommission_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "CreditSale" ADD CONSTRAINT "CreditSale_positive_amount" CHECK ("amount" > 0);
ALTER TABLE "CreditPayment" ADD CONSTRAINT "CreditPayment_positive_amount" CHECK ("amount" > 0);
ALTER TABLE "BrandCommission" ADD CONSTRAINT "BrandCommission_rate_range" CHECK ("rate" >= 0 AND "rate" <= 100);
