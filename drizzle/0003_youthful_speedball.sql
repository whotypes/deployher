-- add short_id column as nullable first
ALTER TABLE "deployments" ADD COLUMN "short_id" text;

-- generate short_id for existing deployments using first 9 chars of id (without hyphens)
UPDATE "deployments" SET "short_id" = LOWER(REPLACE(SUBSTRING(id::text, 1, 11), '-', '')) WHERE "short_id" IS NULL;

-- make short_id not null
ALTER TABLE "deployments" ALTER COLUMN "short_id" SET NOT NULL;

-- add unique constraint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_short_id_unique" UNIQUE("short_id");
