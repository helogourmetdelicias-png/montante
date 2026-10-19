-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'CREDIT_CARD', 'DEBIT_CARD');

-- CreateEnum
CREATE TYPE "PaymentChannel" AS ENUM ('ONLINE', 'TERMINAL', 'EXTERNAL_TERMINAL');

-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('CREATED', 'PENDING', 'APPROVED', 'DECLINED', 'CANCELLED', 'EXPIRED', 'FAILED', 'REFUNDED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "cnpj" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address_street" TEXT,
    "address_number" TEXT,
    "address_complement" TEXT,
    "address_neighborhood" TEXT,
    "address_city" TEXT,
    "address_state" CHAR(2),
    "address_zip" TEXT,
    "logo_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "plan_tier" TEXT NOT NULL DEFAULT 'free',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" TIMESTAMP(3),
    "password_hash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'staff',
    "avatar_url" TEXT,
    "phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sku" TEXT,
    "barcode" TEXT,
    "unit_of_measure" TEXT NOT NULL,
    "sell_by_fraction" BOOLEAN NOT NULL DEFAULT false,
    "price" DECIMAL(10,2) NOT NULL,
    "cost_price" DECIMAL(10,2),
    "stock_quantity" DECIMAL(10,3) NOT NULL,
    "stock_min_alert" DECIMAL(10,3),
    "stock_aisle" TEXT,
    "stock_shelf" TEXT,
    "category" TEXT,
    "brand" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentGatewayConfig" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "encrypted_credentials" TEXT,
    "pix_key" TEXT,
    "pix_key_type" TEXT,
    "display_name" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'sandbox',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentGatewayConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sale_number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payment_method" TEXT,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "sold_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTerminal" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "gateway_config_id" TEXT,
    "provider" TEXT NOT NULL,
    "external_terminal_id" TEXT NOT NULL,
    "external_store_id" TEXT,
    "name" TEXT NOT NULL,
    "connection_status" TEXT NOT NULL DEFAULT 'unpaired',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTerminal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleItem" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "total_price" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "gateway_config_id" TEXT,
    "terminal_id" TEXT,
    "provider" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "channel" "PaymentChannel" NOT NULL,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'CREATED',
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
    "idempotency_key" TEXT NOT NULL,
    "external_order_id" TEXT,
    "external_transaction_id" TEXT,
    "failure_code" TEXT,
    "failure_message" TEXT,
    "expires_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingRecord" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "reference_month" TEXT NOT NULL,
    "total_sales" INTEGER NOT NULL,
    "plan_tier" TEXT NOT NULL,
    "amount_due" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_cnpj_key" ON "Tenant"("cnpj");

-- CreateIndex
CREATE INDEX "User_tenant_id_idx" ON "User"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_tenant_id_key" ON "User"("email", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "Product_tenant_id_idx" ON "Product"("tenant_id");

-- CreateIndex
CREATE INDEX "Product_tenant_id_sku_idx" ON "Product"("tenant_id", "sku");

-- CreateIndex
CREATE INDEX "PaymentGatewayConfig_tenant_id_idx" ON "PaymentGatewayConfig"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentGatewayConfig_tenant_id_provider_key" ON "PaymentGatewayConfig"("tenant_id", "provider");

-- CreateIndex
CREATE INDEX "Sale_tenant_id_idx" ON "Sale"("tenant_id");

-- CreateIndex
CREATE INDEX "Sale_tenant_id_sold_at_idx" ON "Sale"("tenant_id", "sold_at");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_tenant_id_sale_number_key" ON "Sale"("tenant_id", "sale_number");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_id_tenant_id_key" ON "Sale"("id", "tenant_id");

-- CreateIndex
CREATE INDEX "PaymentTerminal_tenant_id_provider_is_active_idx" ON "PaymentTerminal"("tenant_id", "provider", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTerminal_tenant_id_provider_external_terminal_id_key" ON "PaymentTerminal"("tenant_id", "provider", "external_terminal_id");

-- CreateIndex
CREATE INDEX "PaymentAttempt_tenant_id_sale_id_status_idx" ON "PaymentAttempt"("tenant_id", "sale_id", "status");

-- CreateIndex
CREATE INDEX "PaymentAttempt_tenant_id_created_at_idx" ON "PaymentAttempt"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_tenant_id_provider_idempotency_key_key" ON "PaymentAttempt"("tenant_id", "provider", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_provider_external_order_id_key" ON "PaymentAttempt"("provider", "external_order_id");

-- CreateIndex
CREATE INDEX "BillingRecord_tenant_id_idx" ON "BillingRecord"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "BillingRecord_tenant_id_reference_month_key" ON "BillingRecord"("tenant_id", "reference_month");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentGatewayConfig" ADD CONSTRAINT "PaymentGatewayConfig_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTerminal" ADD CONSTRAINT "PaymentTerminal_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTerminal" ADD CONSTRAINT "PaymentTerminal_gateway_config_id_fkey" FOREIGN KEY ("gateway_config_id") REFERENCES "PaymentGatewayConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_sale_id_tenant_id_fkey" FOREIGN KEY ("sale_id", "tenant_id") REFERENCES "Sale"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_gateway_config_id_fkey" FOREIGN KEY ("gateway_config_id") REFERENCES "PaymentGatewayConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "PaymentTerminal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingRecord" ADD CONSTRAINT "BillingRecord_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
