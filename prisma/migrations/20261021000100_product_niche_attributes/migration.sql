-- Optional product characteristics; existing catalogs remain unchanged.
ALTER TABLE "Product" ADD COLUMN "attributes" JSONB;
