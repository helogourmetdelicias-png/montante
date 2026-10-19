-- Keep SKU and barcode values unique inside each tenant.
-- The API stores both values in uppercase before writing them, making this
-- database constraint consistent with the API's case-insensitive checks.
DROP INDEX "Product_tenant_id_sku_idx";

CREATE UNIQUE INDEX "Product_tenant_id_sku_key"
ON "Product"("tenant_id", "sku");

CREATE UNIQUE INDEX "Product_tenant_id_barcode_key"
ON "Product"("tenant_id", "barcode");
