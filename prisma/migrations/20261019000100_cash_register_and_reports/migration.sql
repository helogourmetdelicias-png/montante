CREATE TYPE "CashRegisterStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "CashMovementType" AS ENUM ('SUPPLY', 'WITHDRAWAL');

CREATE UNIQUE INDEX "User_id_tenant_id_key" ON "User"("id", "tenant_id");

CREATE TABLE "CashRegisterSession" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "status" "CashRegisterStatus" NOT NULL DEFAULT 'OPEN',
  "initial_amount" DECIMAL(10,2) NOT NULL,
  "declared_amount" DECIMAL(10,2),
  "expected_amount" DECIMAL(10,2),
  "difference_amount" DECIMAL(10,2),
  "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CashRegisterSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CashRegisterSession_id_tenant_id_key" UNIQUE ("id", "tenant_id"),
  CONSTRAINT "CashRegisterSession_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CashRegisterSession_user_id_tenant_id_fkey" FOREIGN KEY ("user_id", "tenant_id") REFERENCES "User"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "CashRegisterSession_tenant_id_user_id_status_opened_at_idx"
  ON "CashRegisterSession"("tenant_id", "user_id", "status", "opened_at");

-- Prevent two simultaneous shifts for the same operator in the same store.
CREATE UNIQUE INDEX "CashRegisterSession_one_open_per_operator"
  ON "CashRegisterSession"("tenant_id", "user_id") WHERE "status" = 'OPEN';

CREATE TABLE "CashRegisterMovement" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "type" "CashMovementType" NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "description" VARCHAR(240) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashRegisterMovement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CashRegisterMovement_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CashRegisterMovement_session_id_tenant_id_fkey" FOREIGN KEY ("session_id", "tenant_id") REFERENCES "CashRegisterSession"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CashRegisterMovement_user_id_tenant_id_fkey" FOREIGN KEY ("user_id", "tenant_id") REFERENCES "User"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "CashRegisterMovement_tenant_id_session_id_created_at_idx"
  ON "CashRegisterMovement"("tenant_id", "session_id", "created_at");

ALTER TABLE "Sale" ADD COLUMN "cash_register_session_id" TEXT;
CREATE INDEX "Sale_tenant_id_cash_register_session_id_sold_at_idx"
  ON "Sale"("tenant_id", "cash_register_session_id", "sold_at");
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_cash_register_session_id_tenant_id_fkey"
  FOREIGN KEY ("cash_register_session_id", "tenant_id") REFERENCES "CashRegisterSession"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
