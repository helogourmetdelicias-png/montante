ALTER TABLE "Tenant" ADD COLUMN "screensaver_url" TEXT, ADD COLUMN "screensaver_minutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "auth_version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN "image_url" TEXT;

CREATE TABLE "AuthChallenge" (
  "id" TEXT PRIMARY KEY, "user_id" TEXT NOT NULL, "purpose" TEXT NOT NULL,
  "code_hash" TEXT, "token_hash" TEXT UNIQUE, "flow_hash" TEXT NOT NULL,
  "credential_hash" TEXT NOT NULL, "attempts" INTEGER NOT NULL DEFAULT 0,
  "expires_at" TIMESTAMP(3) NOT NULL, "consumed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthChallenge_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX "AuthChallenge_user_id_purpose_idx" ON "AuthChallenge"("user_id", "purpose");
CREATE INDEX "AuthChallenge_expires_at_idx" ON "AuthChallenge"("expires_at");

CREATE TABLE "TrustedDevice" (
  "id" TEXT PRIMARY KEY, "user_id" TEXT NOT NULL, "token_hash" TEXT NOT NULL,
  "auth_version" INTEGER NOT NULL, "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrustedDevice_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "TrustedDevice_user_id_token_hash_key" ON "TrustedDevice"("user_id", "token_hash");
CREATE INDEX "TrustedDevice_expires_at_idx" ON "TrustedDevice"("expires_at");

CREATE TABLE "AuthThrottle" ("key" TEXT PRIMARY KEY, "count" INTEGER NOT NULL DEFAULT 0, "expires_at" TIMESTAMP(3) NOT NULL);
CREATE INDEX "AuthThrottle_expires_at_idx" ON "AuthThrottle"("expires_at");

CREATE TABLE "MediaAsset" (
  "id" TEXT PRIMARY KEY, "tenant_id" TEXT NOT NULL, "user_id" TEXT NOT NULL,
  "purpose" TEXT NOT NULL, "storage_path" TEXT UNIQUE NOT NULL, "mime_type" TEXT NOT NULL, "size" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MediaAsset_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE,
  CONSTRAINT "MediaAsset_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX "MediaAsset_tenant_id_purpose_idx" ON "MediaAsset"("tenant_id", "purpose");
CREATE INDEX "MediaAsset_user_id_created_at_idx" ON "MediaAsset"("user_id", "created_at");
