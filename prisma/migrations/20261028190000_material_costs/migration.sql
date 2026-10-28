ALTER TABLE "Sale" ADD COLUMN "cost_total" DECIMAL(24,2);
ALTER TABLE "ServiceOrder" ADD COLUMN "additional_material_cost" DECIMAL(10,2);
ALTER TABLE "ServiceOrderPart" ADD COLUMN "unit_cost" DECIMAL(10,2);
