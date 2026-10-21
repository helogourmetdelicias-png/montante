-- Platform access is explicitly granted to an individual account, never by email alone.
ALTER TABLE "User" ADD COLUMN "is_platform_admin" BOOLEAN NOT NULL DEFAULT false;
